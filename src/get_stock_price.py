import requests
from datetime import datetime

def normalize_code(symbol: str) -> str:
    """标准化股票代码格式"""
    symbol = str(symbol).strip().upper()
    if symbol.startswith('SH'):
        return f'sh{symbol[2:]}'
    elif symbol.startswith('SZ'):
        return f'sz{symbol[2:]}'
    elif symbol.startswith('6') or symbol.startswith('5'):
        return f'sh{symbol}'
    elif symbol.startswith('0') or symbol.startswith('3') or symbol.startswith('1'):
        return f'sz{symbol}'
    else:
        return symbol

def main(params: dict, context: dict) -> dict:
    """查询个股当前价格、涨跌幅"""
    try:
        # 直接从params中获取symbol参数
        symbol = params.get('symbol', '')
        
        # 如果symbol为空，尝试从param中获取
        if not symbol:
            input_params = params.get('param', {})
            symbol = input_params.get('symbol', '')
        
        if not symbol:
            return {
                "code": 400,
                "message": "请输入股票代码",
                "data": None
            }
        
        code = normalize_code(symbol)
        url = f"http://qt.gtimg.cn/q={code}"
        resp = requests.get(url, timeout=5)
        data_list = resp.text.split('"')[1].split('~')
        
        if len(data_list) < 30:
            return {
                "code": 404,
                "message": "未找到该股票信息，请检查代码。",
                "data": None
            }
        
        # 格式化消息内容
        message_content = f"【💰 个股行情: {data_list[1]} ({code})】\n当前价格: {data_list[3]}\n今日涨跌: {data_list[32]}% ({data_list[31]})\n更新时间: {datetime.now().strftime('%H:%M:%S')}"
        
        result_data = {
            "name": str(data_list[1]),
            "symbol": str(code),
            "price": str(data_list[3]),
            "change_percent": str(data_list[32]),
            "change_amount": str(data_list[31]),
            "update_time": datetime.now().strftime('%H:%M:%S')
        }
        
        return {
            "code": 200,
            "message": message_content,
            "data": result_data
        }
        
    except Exception as e:
        return {
            "code": 500,
            "message": f"查询失败: {str(e)}",
            "data": None
        }