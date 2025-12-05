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
import fs from "fs";
import path from "path";

// =======================
// 辅助函数
// =======================

/**
 * 计算RSI指标
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算MACD指标
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod) {
    return { dif: 0, dea: 0, macd: 0 };
  }
  
  // 计算EMA
  function calculateEMA(data, period) {
    const multiplier = 2 / (period + 1);
    let ema = data[0];
    
    for (let i = 1; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  // 计算快速EMA和慢速EMA
  const recentPrices = prices.slice(-slowPeriod);
  const fastEMA = calculateEMA(recentPrices, fastPeriod);
  const slowEMA = calculateEMA(recentPrices, slowPeriod);
  
  // DIF = 快速EMA - 慢速EMA
  const dif = fastEMA - slowEMA;
  
  // 简化计算DEA
  const dea = dif * 0.9; // 简化处理
  
  // MACD = 2 * (DIF - DEA)
  const macd = 2 * (dif - dea);
  
  return { dif, dea, macd };
}

/**
 * 计算KDJ指标
 */
function calculateKDJ(highs, lows, closes, period = 9) {
  if (highs.length < period) {
    return { k: 50, d: 50, j: 50 };
  }
  
  // 取最近period天的数据
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const recentCloses = closes.slice(-period);
  
  // 计算最高价和最低价
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  
  // 计算RSV
  const currentClose = recentCloses[recentCloses.length - 1];
  const rsv = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  
  // 计算K值、D值、J值
  const k = (2 / 3) * 50 + (1 / 3) * rsv; // 前一日K值设为50
  const d = (2 / 3) * 50 + (1 / 3) * k;   // 前一日D值设为50
  const j = 3 * k - 2 * d;
  
  return { k, d, j };
}

/**
 * 计算BOLL指标
 */
function calculateBOLL(prices, period = 20, multiplier = 2) {
  if (prices.length < period) {
    return { upper: 0, middle: 0, lower: 0 };
  }
  
  // 计算近期平均价
  const recentPrices = prices.slice(-period);
  const sum = recentPrices.reduce((acc, val) => acc + val, 0);
  const middle = sum / period;
  
  // 计算标准差
  const squaredDiffs = recentPrices.map(price => Math.pow(price - middle, 2));
  const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
  const standardDeviation = Math.sqrt(avgSquaredDiff);
  
  // 计算上轨和下轨
  const upper = middle + (multiplier * standardDeviation);
  const lower = middle - (multiplier * standardDeviation);
  
  return { upper, middle, lower };
}

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
      {
        name: "get_stock_news",
        description: "获取指定股票的相关新闻资讯，帮助了解公司动态和市场热点。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码，如600519",
            },
            limit: {
              type: "number",
              description: "返回新闻条数，默认为10条",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_stock_history",
        description: "获取指定日期范围内的历史价格数据。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
            start_date: {
              type: "string",
              description: "开始日期，格式：YYYY-MM-DD",
            },
            end_date: {
              type: "string",
              description: "结束日期，格式：YYYY-MM-DD，默认为当前日期",
            },
          },
          required: ["symbol", "start_date"],
        },
      },
      {
        name: "get_stock_kline",
        description: "获取股票K线数据（日K、周K、月K），包含开盘、收盘、最高、最低、成交量。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
            type: {
              type: "string",
              description: "K线类型：daily（日线）、weekly（周线）、monthly（月线）",
              enum: ["daily", "weekly", "monthly"],
            },
            count: {
              type: "number",
              description: "获取的数据条数，默认30条",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_stock_peers",
        description: "获取指定股票的同行业股票对比，包括市盈率、市净率、市值等指标。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
            limit: {
              type: "number",
              description: "返回同行股票数量，默认为10只",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_hot_stocks",
        description: "获取热门股票排行榜，包括涨跌幅、成交额、换手率等排名。",
        inputSchema: {
          type: "object",
          properties: {
            sort_by: {
              type: "string",
              description: "排序依据：change_rate(涨跌幅)、volume(成交额)、turnover(换手率)",
              enum: ["change_rate", "volume", "turnover"],
            },
            market: {
              type: "string",
              description: "市场范围：all(全部)、sh(沪市)、sz(深市)、cy(创业板)、kc(科创板)",
              enum: ["all", "sh", "sz", "cy", "kc"],
            },
            limit: {
              type: "number",
              description: "返回股票数量，默认为20只",
            },
          },
          required: [],
        },
      },
      {
        name: "get_stock_technical",
        description: "获取股票技术指标分析，包括均线、MACD、RSI、KDJ等技术指标。",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "股票代码",
            },
            period: {
              type: "string",
              description: "分析周期：daily(日线)、weekly(周线)、monthly(月线)",
              enum: ["daily", "weekly", "monthly"],
            },
            indicators: {
              type: "string",
              description: "需要分析的技术指标，多个用逗号分隔：ma(均线)、macd、rsi、kdj、boll",
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

      case "get_stock_news": {
        const code = normalizeCode(args.symbol);
        const limit = args.limit || 10;
        
        try {
          // 获取基本信息以显示股票名称
          const basicUrl = `http://qt.gtimg.cn/q=${code}`;
          const basicText = await fetchStockData(basicUrl);
          const basicDataStr = basicText.split('"')[1];
          const basicData = basicDataStr.split('~');
          const stockName = basicData[1];
          
          // 使用新浪财经的新闻快讯接口
          const newsUrl = `http://hq.sinajs.cn/?list=CF_NEWS`;
          
          let result = `【📰 股票新闻: ${stockName} (${code})】\n`;
          result += "--------财经新闻快讯--------\n";
          
          try {
            const newsText = await fetchStockData(newsUrl);
            const dataStr = newsText.split('"')[1];
            const newsData = dataStr.split('~');
            
            // 过滤与股票相关的新闻
            const stockCode = code.substring(2); // 去掉sh/sz前缀
            let newsCount = 0;
            
            // 解析新闻数据
            for (let i = 0; i < newsData.length - 1 && newsCount < limit; i += 7) {
              if (i + 6 < newsData.length) {
                const title = newsData[i];
                const time = newsData[i+1];
                const content = newsData[i+2];
                
                // 简单判断新闻是否与股票相关（实际项目中需要更智能的匹配）
                if (title && (title.includes("A股") || title.includes("股市") || title.includes("证券") || title.includes("金融"))) {
                  const newsTime = new Date(time * 1000).toLocaleString();
                  result += `${newsCount + 1}. ${title}\n   时间: ${newsTime}\n`;
                  newsCount++;
                }
              }
            }
            
            if (newsCount === 0) {
              result += "未找到与该股票直接相关的最新新闻\n";
              result += "显示最近财经新闻快讯：\n";
              
              // 显示最近的财经新闻
              let count = 0;
              for (let i = 0; i < newsData.length - 1 && count < 3; i += 7) {
                if (i + 6 < newsData.length) {
                  const title = newsData[i];
                  const time = newsData[i+1];
                  
                  if (title && title.trim()) {
                    const newsTime = new Date(time * 1000).toLocaleString();
                    result += `${count + 1}. ${title}\n   时间: ${newsTime}\n`;
                    count++;
                  }
                }
              }
            }
          } catch (newsError) {
            throw new Error(`新闻数据解析失败: ${newsError.message}`);
          }
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `新闻数据获取失败: ${error.message}` }] };
        }
      }

      case "get_stock_history": {
        const code = normalizeCode(args.symbol);
        const endDate = args.end_date || new Date().toISOString().split('T')[0];
        const startDate = args.start_date;
        
        // 使用新浪财经历史数据接口
        const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code.replace('sh', 'sh').replace('sz', 'sz')}&scale=240&ma=no&datalen=30`;
        
        try {
          const text = await fetchStockData(url);
          
          // 获取基本信息以显示股票名称
          const basicUrl = `http://qt.gtimg.cn/q=${code}`;
          const basicText = await fetchStockData(basicUrl);
          const basicDataStr = basicText.split('"')[1];
          const basicData = basicDataStr.split('~');
          const stockName = basicData[1];
          
          // 解析历史数据
          const data = JSON.parse(text);
          
          let result = `【📈 历史价格数据: ${stockName} (${code})】\n`;
          result += `查询日期范围: ${startDate} 至 ${endDate}\n`;
          result += "--------近期交易数据--------\n";
          
          // 只显示最近5条数据作为示例
          const recentData = data.slice(-5).reverse();
          recentData.forEach(item => {
            const date = item.day.split(' ')[0];
            const open = item.open;
            const high = item.high;
            const low = item.low;
            const close = item.close;
            const volume = item.volume;
            
            result += `${date}: 开盘${open} | 最高${high} | 最低${low} | 收盘${close} | 成交量${volume}\n`;
          });
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `历史数据获取失败: ${error.message}` }] };
        }
      }

      case "get_stock_kline": {
        const code = normalizeCode(args.symbol);
        const type = args.type || "daily";
        const count = args.count || 30;
        
        // 根据K线类型确定参数
        let scale = 240; // 默认日线
        if (type === "weekly") scale = 1200;
        if (type === "monthly") scale = 7200;
        
        const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code.replace('sh', 'sh').replace('sz', 'sz')}&scale=${scale}&ma=no&datalen=${count}`;
        
        try {
          const text = await fetchStockData(url);
          
          // 获取基本信息以显示股票名称
          const basicUrl = `http://qt.gtimg.cn/q=${code}`;
          const basicText = await fetchStockData(basicUrl);
          const basicDataStr = basicText.split('"')[1];
          const basicData = basicDataStr.split('~');
          const stockName = basicData[1];
          
          // 解析K线数据
          const data = JSON.parse(text);
          
          let result = `【📊 K线数据: ${stockName} (${code})】\n`;
          result += `K线类型: ${type === "daily" ? "日线" : type === "weekly" ? "周线" : "月线"}\n`;
          result += `显示最近 ${data.length} 条数据\n`;
          result += "--------K线数据详情--------\n";
          
          // 显示最近5条数据作为示例
          const recentData = data.slice(-5).reverse();
          recentData.forEach((item, index) => {
            const date = item.day.split(' ')[0];
            const open = item.open;
            const high = item.high;
            const low = item.low;
            const close = item.close;
            const volume = item.volume;
            
            // 计算涨跌幅
            const change = index < recentData.length - 1 ? 
              ((parseFloat(close) - parseFloat(recentData[index + 1].close)) / parseFloat(recentData[index + 1].close) * 100).toFixed(2) : 
              "0.00";
            const changeIcon = parseFloat(change) > 0 ? "🔴" : "🟢";
            
            result += `${date}: OHLC(${open}|${high}|${low}|${close}) | 成交量${volume} | ${changeIcon}${change}%\n`;
          });
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `K线数据获取失败: ${error.message}` }] };
        }
      }

      case "get_stock_peers": {
        const code = normalizeCode(args.symbol);
        const limit = args.limit || 10;
        
        try {
          // 获取基本信息以显示股票名称
          const basicUrl = `http://qt.gtimg.cn/q=${code}`;
          const basicText = await fetchStockData(basicUrl);
          const basicDataStr = basicText.split('"')[1];
          const basicData = basicDataStr.split('~');
          const stockName = basicData[1];
          const pe = basicData[39] ? basicData[39] : "N/A";
          const pb = basicData.length > 46 ? basicData[46] : basicData[44];
          const marketCap = basicData[45];
          
          // 尝试获取行业分类和同行业股票
          let result = `【📊 同行业股票对比: ${stockName} (${code})】\n`;
          result += "--------目标股票指标--------\n";
          result += `${stockName}: PE=${pe}, PB=${pb}, 市值=${marketCap}亿\n`;
          
          // 根据股票代码前缀确定同行业股票列表
          const stockCode = code.substring(2);
          let peerCodes = [];
          
          // 根据市场获取同行股票代码
          if (code.startsWith("sh") && stockCode.startsWith("60")) {
            // 沪市主板银行股（以平安银行为例）
            peerCodes = ["sh600000", "sh600036", "sh600015", "sh600016", "sh601328", "sh601398", "sh601939", "sh601166", "sh601229", "sh600104"];
          } else if (code.startsWith("sz") && stockCode.startsWith("00")) {
            // 深市主板银行股
            peerCodes = ["sz000001", "sz000002", "sz000725", "sz000876", "sz000839", "sz000858", "sz000001", "sz000002", "sz000725", "sz000876"];
          } else if (code.startsWith("sz") && stockCode.startsWith("30")) {
            // 创业板（不同行业）
            peerCodes = ["sz300001", "sz300002", "sz300003", "sz300005", "sz300015", "sz300033", "sz300059", "sz300124", "sz300142", "sz300750"];
          } else {
            // 默认一些知名股票
            peerCodes = ["sh600519", "sh601318", "sh600036", "sz000858", "sz300750", "sz002594", "sh600276", "sz000651", "sh601988", "sz002415"];
          }
          
          result += "--------同行业对比--------\n";
          let peerCount = 0;
          
          for (const peerCode of peerCodes) {
            if (peerCount >= limit) break;
            
            try {
              const peerUrl = `http://qt.gtimg.cn/q=${peerCode}`;
              const peerText = await fetchStockData(peerUrl);
              const peerDataStr = peerText.split('"')[1];
              const peerData = peerDataStr.split('~');
              
              if (peerData.length > 30) {
                const peerName = peerData[1];
                const peerPe = peerData[39] ? peerData[39] : "N/A";
                const peerPb = peerData.length > 46 ? peerData[46] : peerData[44];
                const peerMarketCap = peerData[45];
                
                result += `${peerName} (${peerCode}): PE=${peerPe}, PB=${peerPb}, 市值=${peerMarketCap}亿\n`;
                peerCount++;
              }
            } catch (peerError) {
              // 忽略单个股票获取失败的情况
            }
          }
          
          if (peerCount === 0) {
            result += "未能获取到同行业股票数据";
          }
          
          result += "--------分析建议--------\n";
          result += "注：以上数据仅供参考，投资需谨慎。市盈率(PE)越低可能表示估值较低，市净率(PB)越低可能表示资产估值较低。";
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `同行业对比数据获取失败: ${error.message}` }] };
        }
      }

      case "get_hot_stocks": {
        const sortBy = args.sort_by || "change_rate";
        const market = args.market || "all";
        const limit = args.limit || 20;
        
        try {
          // 根据排序方式选择不同的新浪财经接口
          let node = "hs_a"; // 默认全部A股
          if (market === "sh") node = "hs_a";
          if (market === "sz") node = "hs_a";
          if (market === "cy") node = "hs_sme"; // 创业板
          if (market === "kc") node = "hs_sme"; // 科创板(使用相同节点，后面过滤)
          
          let sortField = "changepercent";
          if (sortBy === "volume") sortField = "amount";
          if (sortBy === "turnover") sortField = "turnoverratio";
          
 // 根据市场和排序方式选择热门股票列表
          let hotStocks = [];
          
          if (market === "sh" || market === "all") {
            // 沪市热门股票
            hotStocks = [
              "sh600519", "sh601318", "sh600036", "sh600276", "sh601328",
              "sh600000", "sh601398", "sh601939", "sh600104", "sh601988"
            ];
          }
          
          if (market === "sz" || market === "all") {
            // 深市热门股票
            const szStocks = [
              "sz000858", "sz000651", "sz300750", "sz002594", "sz002415",
              "sz000001", "sz000002", "sz000725", "sz300015", "sz300142"
            ];
            hotStocks = [...hotStocks, ...szStocks];
          }
          
          if (market === "cy" || market === "all") {
            // 创业板热门股票
            const cyStocks = [
              "sz300750", "sz300059", "sz300142", "sz300124", "sz300033"
            ];
            hotStocks = [...hotStocks, ...cyStocks];
          }
          
          // 去重
          hotStocks = [...new Set(hotStocks)].slice(0, limit);
          
          let result = `【🔥 热门股票排行榜】\n`;
          result += `排序依据: ${sortBy === "change_rate" ? "涨跌幅" : 
                          sortBy === "volume" ? "成交额" : "换手率"}\n`;
          result += `市场范围: ${market === "all" ? "全部A股" : 
                           market === "sh" ? "沪市" :
                           market === "sz" ? "深市" :
                           market === "cy" ? "创业板" : "科创板"}\n`;
          result += "--------热门股票--------\n";
          
          // 获取热门股票数据
          let stockData = [];
          for (const stockCode of hotStocks) {
            try {
              const stockUrl = `http://qt.gtimg.cn/q=${stockCode}`;
              const stockText = await fetchStockData(stockUrl);
              const stockDataStr = stockText.split('"')[1];
              const stockItem = stockDataStr.split('~');
              
              if (stockItem.length > 30) {
                const name = stockItem[1];
                const price = parseFloat(stockItem[3]);
                const changePercent = parseFloat(stockItem[32]);
                const volume = parseFloat(stockItem[6]);
                const turnover = parseFloat(stockItem[38]) || 0;
                
                stockData.push({
                  code: stockCode,
                  name,
                  price,
                  changePercent,
                  volume,
                  turnover
                });
              }
            } catch (error) {
              // 忽略单个股票获取失败的情况
            }
          }
          
          // 根据排序方式排序
          stockData.sort((a, b) => {
            if (sortBy === "change_rate") {
              return b.changePercent - a.changePercent;
            } else if (sortBy === "volume") {
              return b.volume - a.volume;
            } else if (sortBy === "turnover") {
              return b.turnover - a.turnover;
            }
            return 0;
          });
          
          // 显示结果
          stockData.slice(0, limit).forEach((stock, index) => {
            const icon = stock.changePercent > 0 ? "🔴" : "🟢";
            result += `${index + 1}. ${stock.name} (${stock.code})\n`;
            result += `   ${icon}价格: ${stock.price} | 涨跌幅: ${stock.changePercent}%\n`;
            result += `   成交额: ${(stock.volume/100000000).toFixed(2)}亿 | 换手率: ${stock.turnover}%\n`;
          });
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `热门股票数据获取失败: ${error.message}` }] };
        }
      }

      case "get_stock_technical": {
        const code = normalizeCode(args.symbol);
        const period = args.period || "daily";
        const indicators = args.indicators || "ma,macd,rsi,kdj,boll";
        
        try {
          // 获取基本信息以显示股票名称
          const basicUrl = `http://qt.gtimg.cn/q=${code}`;
          const basicText = await fetchStockData(basicUrl);
          const basicDataStr = basicText.split('"')[1];
          const basicData = basicDataStr.split('~');
          const stockName = basicData[1];
          const currentPrice = basicData[3];
          
          // 获取K线数据用于技术指标计算
          let scale = 240; // 默认日线
          if (period === "weekly") scale = 1200;
          if (period === "monthly") scale = 7200;
          
          const klineUrl = `http://finance.sina.com.cn/realstock/company/${code}/klc_kl.js`;
          
          let result = `【📊 技术指标分析: ${stockName} (${code})】\n`;
          result += `分析周期: ${period === "daily" ? "日线" : period === "weekly" ? "周线" : "月线"}\n`;
          result += `当前价格: ${currentPrice}\n`;
          result += "--------技术指标分析--------\n";
          
          try {
            // 使用新浪财经的K线数据接口
            const dataUrl = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${code}&scale=240&ma=no&datalen=60`;
            const klineText = await fetchStockData(dataUrl);
            const klineData = JSON.parse(klineText);
            
            if (klineData && klineData.length > 20) {
              const closePrices = klineData.map(item => parseFloat(item.close));
              const highPrices = klineData.map(item => parseFloat(item.high));
              const lowPrices = klineData.map(item => parseFloat(item.low));
              const volumes = klineData.map(item => parseFloat(item.volume));
              
              // 计算MA5, MA10, MA20
              if (indicators.includes("ma")) {
                const ma5 = closePrices.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
                const ma10 = closePrices.slice(-10).reduce((sum, val) => sum + val, 0) / 10;
                const ma20 = closePrices.slice(-20).reduce((sum, val) => sum + val, 0) / 20;
                
                result += `MA5: ${ma5.toFixed(2)} (${currentPrice > ma5 ? "高于" : "低于"}均线)\n`;
                result += `MA10: ${ma10.toFixed(2)} (${currentPrice > ma10 ? "高于" : "低于"}均线)\n`;
                result += `MA20: ${ma20.toFixed(2)} (${currentPrice > ma20 ? "高于" : "低于"}均线)\n`;
              }
              
              // 计算RSI
              if (indicators.includes("rsi")) {
                const rsi = calculateRSI(closePrices, 14);
                result += `RSI(14): ${rsi.toFixed(2)} (${rsi > 70 ? "超买" : rsi < 30 ? "超卖" : "正常"})\n`;
              }
              
              // 计算MACD
              if (indicators.includes("macd")) {
                const macdData = calculateMACD(closePrices);
                result += `MACD: DIF=${macdData.dif.toFixed(2)}, DEA=${macdData.dea.toFixed(2)}, MACD=${macdData.macd.toFixed(2)}\n`;
                result += `MACD信号: ${macdData.macd > 0 ? "多头市场" : "空头市场"}\n`;
              }
              
              // 计算KDJ
              if (indicators.includes("kdj")) {
                const kdjData = calculateKDJ(highPrices, lowPrices, closePrices);
                result += `KDJ: K=${kdjData.k.toFixed(2)}, D=${kdjData.d.toFixed(2)}, J=${kdjData.j.toFixed(2)}\n`;
                result += `KDJ信号: ${kdjData.j > 100 ? "超买" : kdjData.j < 0 ? "超卖" : "正常"}\n`;
              }
              
              // 计算BOLL
              if (indicators.includes("boll")) {
                const bollData = calculateBOLL(closePrices, 20);
                result += `BOLL(20): 上轨=${bollData.upper.toFixed(2)}, 中轨=${bollData.middle.toFixed(2)}, 下轨=${bollData.lower.toFixed(2)}\n`;
                result += `BOLL信号: ${currentPrice > bollData.upper ? "突破上轨" : currentPrice < bollData.lower ? "跌破下轨" : "在轨道内"}\n`;
              }
            } else {
              throw new Error("数据不足，无法计算技术指标");
            }
          } catch (apiError) {
            throw new Error(`技术指标计算失败: ${apiError.message}`);
          }
          
          result += "--------投资建议--------\n";
          result += "注：技术指标仅供参考，投资需谨慎。建议结合基本面分析和市场环境综合判断。";
          
          return { content: [{ type: "text", text: result }] };
        } catch (error) {
          return { content: [{ type: "text", text: `技术指标分析失败: ${error.message}` }] };
        }
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