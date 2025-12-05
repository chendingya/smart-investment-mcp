# Pro Stock MCP - 专业股票数据查询工具

一个支持 [Model Context Protocol](https://modelcontextprotocol.io) 协议的股票数据查询服务，可以查询中国A股市场的实时行情数据。该项目包含 Python 和 Node.js 两个版本的实现。

## 功能特性

- 📈 实时查询A股三大指数（上证指数、深证成指、创业板指）
- 📊 查询个股实时价格及涨跌情况
- 📉 获取个股基本面指标（市盈率、市净率、总市值）
- ⚡ 查看股票买卖五档盘口数据
- 📰 获取股票相关新闻资讯
- 📊 获取股票历史价格数据和K线数据
- 📈 获取同行业股票对比分析
- 🔥 获取热门股票排行榜
- 📊 获取股票技术指标分析（RSI、MACD、KDJ、BOLL等）
- 🐳 支持 Docker 部署
- 🔌 支持 MCP 协议，可与支持该协议的应用集成

## 项目结构

```
.
├── src/                  # Python 版本实现
│   ├── server.py         # 主服务文件
│   ├── get_market_overview.py
│   └── get_stock_price.py
├── pro-stock-mcp/        # Node.js 版本实现
│   ├── index.js          # 主服务文件（包含完整的MCP服务和所有工具实现）
│   └── package.json
├── dockerfile            # Docker 构建文件
├── requirements.txt      # Python 依赖文件
└── 记录/                 # 相关文档和截图
```

## 快速开始

### 使用 Docker 运行（推荐）

构建镜像：
```bash
docker build -t mcp-service .
```

运行容器：
```bash
docker run -d -p 8000:8000 --name stock-mcp mcp-service
```

服务将在 `http://localhost:8000/sse` 上提供。

### 直接运行 Python 版本

安装依赖：
```bash
pip install -r requirements.txt
```

运行服务：
```bash
fastmcp run src/server.py --transport sse --host 0.0.0.0 --port 8000
```

### 运行 Node.js 版本

安装依赖：
```bash
cd pro-stock-mcp
npm install
```

运行服务：
```bash
node index.js
```

或全局安装后运行：
```bash
npm install -g .
pro-stock-mcp
```

## 支持的工具

该服务实现了以下MCP工具：

1. `get_market_overview` - 获取A股三大指数实时行情
2. `get_stock_price` - 查询个股当前价格和涨跌幅
3. `get_stock_fundamentals` - 获取个股基本面指标（市盈率、市净率、总市值）
4. `get_trading_depth` - 查看股票买卖五档盘口数据
5. `get_stock_news` - 获取指定股票的相关新闻资讯
6. `get_stock_history` - 获取指定日期范围内的历史价格数据
7. `get_stock_kline` - 获取股票K线数据（日K、周K、月K）
8. `get_stock_peers` - 获取同行业股票对比分析
9. `get_hot_stocks` - 获取热门股票排行榜
10. `get_stock_technical` - 获取股票技术指标分析

## 技术栈

- Python 版本：使用 [FastMCP](https://github.com/fastai/fastmcp) 框架
- Node.js 版本：使用 [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- 数据源：腾讯证券、新浪金融等公开API
- 技术指标计算：内置RSI、MACD、KDJ、BOLL等技术指标算法实现

## 使用示例

### 查询大盘指数
```
get_market_overview
```

### 查询个股行情
```
get_stock_price(symbol="600519")
```

### 获取技术指标分析
```
get_stock_technical(symbol="600519", period="daily", indicators="ma,macd,rsi,kdj,boll")
```

### 获取同行业股票对比
```
get_stock_peers(symbol="600519", limit=10)
```

## 部署

你可以通过多种方式进行部署：

1. 使用 Docker（推荐）
2. 直接在服务器上运行
3. 部署到云服务平台（如阿里云、腾讯云等）

## License

本项目采用 MIT 许可证授权。