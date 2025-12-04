#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import iconv from "iconv-lite";

// =======================
// 辅助函数
// =======================

/**
 * 标准化股票代码
 * @param {string} symbol 
 * @returns {string}
 */
function normalizeCode(symbol) {
  if (symbol.startsWith("sh") || symbol.startsWith("sz")) {
    return symbol;
  }
  if (symbol.startsWith("5") || symbol.startsWith("6")) {
    return `sh${symbol}`;
  }
  return `sz${symbol}`;
}

/**
 * 通用请求函数，处理 GBK 编码问题
 */
async function fetchStockData(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer", // 关键：以二进制方式接收
      timeout: 8000,
      // 使用更接近浏览器的请求头，降低被目标站点屏蔽的概率
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        Connection: "keep-alive",
      },
      // 我们手动检查状态码以便记录更详细信息
      validateStatus: null,
    });

    if (response.status === 403) {
      console.error(`fetchStockData 403 from ${url}`);
      console.error("response headers:", response.headers);
      const err = new Error(`请求被拒绝 (HTTP 403)`);
      err.debug = { url, status: 403, headers: response.headers };
      throw err;
    }

    if (response.status >= 400) {
      console.error(`fetchStockData HTTP ${response.status} from ${url}`);
      const err = new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
      err.debug = { url, status: response.status, statusText: response.statusText, headers: response.headers };
      throw err;
    }

    // 将 GBK 解码为 UTF-8 字符串
    return iconv.decode(response.data, "gbk");
  } catch (error) {
    // 如果是 axios 返回的 response，已经在上面处理过，但还是保底输出日志
    if (error && error.response) {
      console.error("fetchStockData error response:", {
        url,
        status: error.response.status,
        headers: error.response.headers,
      });
      const err = new Error(`请求失败: HTTP ${error.response.status}`);
      err.debug = { url, status: error.response.status, headers: error.response.headers };
      throw err;
    }

    console.error("fetchStockData error:", error && error.message ? error.message : error);
    const err = new Error(`请求失败: ${error && error.message ? error.message : String(error)}`);
    err.debug = { url, message: error && error.message ? error.message : String(error) };
    throw err;
  }
}

// =======================
// MCP 服务器初始化
// =======================

const server = new Server(
  {
    name: "ProStockAssistant",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 添加对initialize请求的处理
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  console.error("Initializing ProStockAssistant MCP Server...");
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    serverInfo: {
      name: "ProStockAssistant",
      version: "1.0.0"
    }
  };
});

// =======================
// 定义工具列表 (ListTools)
// =======================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Listing available tools...");
  return {
    tools: [
      {
        name: "get_market_overview",
        description: "获取 A 股核心大盘指数（上证、深证、创业板）的实时行情。",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_stock_price",
        description: "查询个股当前价格、涨跌幅。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码，如 600519",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_stock_fundamentals",
        description: "获取个股的重要财务指标：市盈率(PE)、市净率(PB)、总市值。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_trading_depth",
        description: "查看股票的买卖五档盘口（买一到买五，卖一到卖五）。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
          },
          required: ["symbol"],
        },
      },
    ],
  };
});

// =======================
// 处理工具调用 (CallTool)
// =======================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    console.error(`Executing tool: ${name} with args:`, args);
    
    switch (name) {
      case "get_market_overview": {
        const url = "http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006";
        const text = await fetchStockData(url);
        
        let result = "【A股大盘实时概览】\n";
        const indexNames = {
          "s_sh000001": "上证指数",
          "s_sz399001": "深证成指",
          "s_sz399006": "创业板指"
        };
        
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.length < 10) continue;
          
          // 解析: var hq_str_s_sh000001="上证指数,3000.00,-10.00,-0.33,..."
          const leftSide = line.split('=')[0];
          const code = leftSide.split('str_')[1];
          const dataStr = line.split('"')[1];
          const data = dataStr.split(',');

          if (indexNames[code]) {
            const name = indexNames[code];
            const price = data[1];
            const changePct = data[3];
            let icon = parseFloat(changePct) > 0 ? "🔴" : "🟢";
            if (parseFloat(changePct) < 0) icon = "🟢";

            result += `${icon} ${name}: ${price} (${changePct}%)\n`;
          }
        }
        return { content: [{ type: "text", text: result }] };
      }

      case "get_stock_price": {
        const code = normalizeCode(args.symbol);
        const url = `http://qt.gtimg.cn/q=${code}`;
        const text = await fetchStockData(url);
        
        const dataStr = text.split('"')[1];
        const data = dataStr.split('~');

        if (data.length < 30) {
          return { content: [{ type: "text", text: "未找到该股票信息，请检查代码。" }] };
        }

        const result = 
          `【💰 个股行情: ${data[1]} (${code})】\n` +
          `当前价格: ${data[3]}\n` +
          `今日涨跌: ${data[32]}% (${data[31]})\n` +
          `更新时间: ${new Date().toLocaleTimeString()}`;

        return { content: [{ type: "text", text: result }] };
      }

      case "get_stock_fundamentals": {
        const code = normalizeCode(args.symbol);
        const url = `http://qt.gtimg.cn/q=${code}`;
        const text = await fetchStockData(url);
        
        const dataStr = text.split('"')[1];
        const data = dataStr.split('~');

        if (data.length < 45) {
          return { content: [{ type: "text", text: "财务数据暂不可用。" }] };
        }

        const pe = data[39] ? data[39] : "N/A";
        const pb = data.length > 46 ? data[46] : data[44];
        const mktCap = data[45];

        const result = 
          `【📉 基本面/估值分析: ${data[1]}】\n` +
          `市盈率 (PE-TTM): ${pe} (衡量回本年限)\n` +
          `市净率 (PB): ${pb} (衡量资产溢价)\n` +
          `总市值: ${mktCap} 亿\n` +
          `------------------\n` +
          `小贴士: PE越低通常代表越便宜，但也可能意味着增长停滞。`;

        return { content: [{ type: "text", text: result }] };
      }

      case "get_trading_depth": {
        const code = normalizeCode(args.symbol);
        const url = `http://hq.sinajs.cn/list=${code}`;
        const text = await fetchStockData(url);

        if (!text.includes('="')) {
           return { content: [{ type: "text", text: "盘口数据获取失败。" }] };
        }

        const dataStr = text.split('"')[1];
        const data = dataStr.split(',');
        const name = data[0];

        let result = `【⚡ 交易五档盘口: ${name}】\n`;
        result += "--------卖盘 (阻力)--------\n";
        result += `卖五: ${data[29]} | ${Math.floor(parseInt(data[28])/100)}手\n`;
        result += `卖四: ${data[27]} | ${Math.floor(parseInt(data[26])/100)}手\n`;
        result += `卖三: ${data[25]} | ${Math.floor(parseInt(data[24])/100)}手\n`;
        result += `卖二: ${data[23]} | ${Math.floor(parseInt(data[22])/100)}手\n`;
        result += `卖一: ${data[21]} | ${Math.floor(parseInt(data[20])/100)}手\n`;
        result += "--------买盘 (支撑)--------\n";
        result += `买一: ${data[11]} | ${Math.floor(parseInt(data[10])/100)}手\n`;
        result += `买二: ${data[13]} | ${Math.floor(parseInt(data[12])/100)}手\n`;

        return { content: [{ type: "text", text: result }] };
      }

      default:
        throw new Error(`未找到工具: ${name}`);
    }
  } catch (error) {
    // 打印错误及调试信息到 stderr
    console.error("Tool handler error:", error && error.message ? error.message : error);
    if (error && error.debug) console.error("Tool handler debug:", error.debug);

    // 如果环境变量 MCP_DEBUG=true，则在返回中包含调试信息（便于云端无法访问主机日志时排查）
    const includeDebug = process.env.MCP_DEBUG === "true";
    const debugText = includeDebug && error && error.debug ? `\nDEBUG: ${JSON.stringify(error.debug)}` : "";

    return {
      content: [{ type: "text", text: `工具执行出错: ${error.message}${debugText}` }],
      isError: true,
    };
  }
});

// =======================
// 启动服务器
// =======================

async function main() {
  const transport = new StdioServerTransport();
  console.error("ProStockAssistant MCP Server starting...");
  await server.connect(transport);
  console.error("ProStockAssistant MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});