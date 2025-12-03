import requests
from fastmcp import FastMCP
from datetime import datetime

# 初始化 MCP 服务
mcp = FastMCP("ProStockAssistant")

# =======================
# 辅助函数
# =======================
def normalize_code(symbol: str) -> str:
    """标准化股票代码，如 600519 -> sh600519"""
    if symbol.startswith(('sh', 'sz')):
        return symbol
    if symbol.startswith(('5', '6')):
        return f"sh{symbol}"
    return f"sz{symbol}"

# =======================
# 工具 1: 获取大盘指数
# =======================
@mcp.tool()
def get_market_overview() -> str:
    """
    获取 A 股核心大盘指数（上证、深证、创业板）的实时行情。
    用于分析整体市场情绪。
    """
    try:
        # 新浪指数接口: s_sh000001(上证), s_sz399001(深证), s_sz399006(创业板)
        url = "http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006"
        headers = {"Referer": "https://finance.sina.com.cn"}
        resp = requests.get(url, headers=headers, timeout=5)
        
        lines = resp.text.split('\n')
        result = "【A股大盘实时概览】\n"
        
        index_names = {"s_sh000001": "上证指数", "s_sz399001": "深证成指", "s_sz399006": "创业板指"}
        
        for line in lines:
            if len(line) < 10: continue
            # 解析: var hq_str_s_sh000001="上证指数,3000.00,-10.00,-0.33,..."
            code = line.split('=')[0].split('str_')[1]
            data = line.split('"')[1].split(',')
            
            if code in index_names:
                name = index_names[code]
                price = data[1]
                change_pct = data[3]
                icon = "🔴" if float(change_pct) > 0 else "zz"  # 简单图示
                if float(change_pct) < 0: icon = "🟢"
                
                result += f"{icon} {name}: {price} ({change_pct}%)\n"
                
        return result
    except Exception as e:
        return f"大盘数据获取失败: {str(e)}"

# =======================
# 工具 2: 获取个股实时价格
# =======================
@mcp.tool()
def get_stock_price(symbol: str) -> str:
    """
    查询个股当前价格、涨跌幅。
    Args:
        symbol: 股票代码，如 "600519"
    """
    code = normalize_code(symbol)
    try:
        # 使用腾讯接口，解析简单
        url = f"http://qt.gtimg.cn/q={code}"
        resp = requests.get(url, timeout=5)
        data = resp.text.split('"')[1].split('~')
        
        if len(data) < 30:
            return "未找到该股票信息，请检查代码。"
            
        # 腾讯数据映射: 1:名字, 3:当前价, 31:涨跌额, 32:涨跌幅
        return (
            f"【💰 个股行情: {data[1]} ({code})】\n"
            f"当前价格: {data[3]}\n"
            f"今日涨跌: {data[32]}% ({data[31]})\n"
            f"更新时间: {datetime.now().strftime('%H:%M:%S')}"
        )
    except Exception as e:
        return f"查询失败: {str(e)}"

# =======================
# 工具 3: 获取个股基本面指标 (估值分析)
# =======================
@mcp.tool()
def get_stock_fundamentals(symbol: str) -> str:
    """
    获取个股的重要财务指标：市盈率(PE)、市净率(PB)、总市值。
    用于判断股票是否昂贵（估值分析）。
    Args:
        symbol: 股票代码
    """
    code = normalize_code(symbol)
    try:
        url = f"http://qt.gtimg.cn/q={code}"
        resp = requests.get(url, timeout=5)
        data = resp.text.split('"')[1].split('~')
        
        if len(data) < 45:
            return "财务数据暂不可用。"
            
        # 腾讯数据映射: 39:市盈率(TTM), 44:市净率, 45:总市值(亿)
        pe = data[39] if data[39] else "N/A"
        pb = data[46] if len(data)>46 else data[44] # 腾讯接口有时候位置会有微调
        mkt_cap = data[45]
        
        return (
            f"【📉 基本面/估值分析: {data[1]}】\n"
            f"市盈率 (PE-TTM): {pe} (衡量回本年限)\n"
            f"市净率 (PB): {pb} (衡量资产溢价)\n"
            f"总市值: {mkt_cap} 亿\n"
            f"------------------\n"
            f"小贴士: PE越低通常代表越便宜，但也可能意味着增长停滞。"
        )
    except Exception as e:
        return f"基本面数据获取失败: {str(e)}"

# =======================
# 工具 4: 获取买卖五档盘口 (交易深度)
# =======================
@mcp.tool()
def get_trading_depth(symbol: str) -> str:
    """
    查看股票的买卖五档盘口（买一到买五，卖一到卖五）。
    用于分析短期资金博弈情况。
    """
    code = normalize_code(symbol)
    try:
        url = f"http://hq.sinajs.cn/list={code}"
        headers = {"Referer": "https://finance.sina.com.cn"}
        resp = requests.get(url, headers=headers, timeout=5)
        
        if "=\"" not in resp.text:
            return "盘口数据获取失败。"
            
        # 新浪数据: 0:名 ... 10:买一量 11:买一价 ... 20:卖一量 21:卖一价 ...
        data = resp.text.split('"')[1].split(',')
        name = data[0]
        
        # 简单的格式化
        result = f"【⚡ 交易五档盘口: {name}】\n"
        result += "--------卖盘 (阻力)--------\n"
        result += f"卖五: {data[29]} | {int(data[28])//100}手\n"
        result += f"卖四: {data[27]} | {int(data[26])//100}手\n"
        result += f"卖三: {data[25]} | {int(data[24])//100}手\n"
        result += f"卖二: {data[23]} | {int(data[22])//100}手\n"
        result += f"卖一: {data[21]} | {int(data[20])//100}手\n"
        result += "--------买盘 (支撑)--------\n"
        result += f"买一: {data[11]} | {int(data[10])//100}手\n"
        result += f"买二: {data[13]} | {int(data[12])//100}手\n"
        # 节省篇幅，演示显示前两档即可，或者全显示
        
        return result
    except Exception as e:
        return "盘口数据不可用。"

if __name__ == "__main__":
    # 本地开发调试时：
    mcp.run() 
    
    # 部署给百宝箱时 (配合 ngrok):
    # mcp.run(transport="sse")