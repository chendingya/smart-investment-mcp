# Pro Stock MCP 开发记录

## 项目概述

Pro Stock MCP 是一个支持 Model Context Protocol (MCP) 协议的股票数据查询服务，可以查询中国A股市场的实时行情数据。项目包含 Python 和 Node.js 两个版本的实现。

## 核心功能

- 查询 A 股核心大盘指数（上证、深证、创业板）的实时行情。
  - 用于分析整体市场情绪。
- 查询个股当前价格、涨跌幅。
- 获取个股的重要财务指标：市盈率(PE)、市净率(PB)、总市值。
  - 用于判断股票是否昂贵（估值分析）。
- 查看股票的买卖五档盘口（买一到买五，卖一到卖五）。
  - 用于分析短期资金博弈情况。

## 技术实现

### Python 版本
- 使用 FastMCP 框架
- 数据源：腾讯证券、新浪金融等公开API
- 支持 SSE 传输协议

### Node.js 版本
- 使用 @modelcontextprotocol/sdk
- 数据源：腾讯证券、新浪金融等公开API
- 支持标准输入输出传输协议

## 部署记录

### Docker 部署方式

构建镜像：
```bash
docker build -t mcp-service .
```

运行容器：
```bash
docker run -d -p 8000:8000 --name stock-mcp --restart always mcp-service
fb01248999c130d3daeac8e540dd4ae8a7efe0a987192d50c5f3b73bd67bdef5
```

查看日志：
```bash
docker logs -f stock-mcp
```

服务地址：
http://39.97.46.180:8000/sse

### 直接运行方式

Python 版本：
```bash
pip install -r requirements.txt
fastmcp run src/server.py --transport sse --host 0.0.0.0 --port 8000
```

Node.js 版本：
```bash
cd pro-stock-mcp
npm install
node index.js
```

## 项目结构

```
.
├── src/                  # Python 版本实现
│   ├── server.py         # 主服务文件
│   ├── get_market_overview.py
│   └── get_stock_price.py
├── pro-stock-mcp/        # Node.js 版本实现
│   ├── index.js          # 主服务文件
│   ├── package.json
│   └── package-lock.json
├── dockerfile            # Docker 构建文件
├── requirements.txt      # Python 依赖文件
└── 记录/                 # 相关文档和截图
```

## 开发截图

开发过程中的一些重要截图已保存在本目录中：
本项目由lingma与qwen-max共同辅助开发，lingma主要负责编程，qwen-max则负责解答中途一些疑难杂症。

## 更新日志

### 2025-12-03
- 完成 Python 和 Node.js 双版本实现
- 实现四大核心功能模块
- 完成 Docker 部署配置
- 编写完整的项目文档
- 整理开发过程截图和记录