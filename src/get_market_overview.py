import requests
import json

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
        
        index_names = {
            "s_sh000001": "上证指数",
            "s_sz399001": "深证成指",
            "s_sz399006": "创业板指"
        }
        
        for line in lines:
            if len(line) < 10:
                continue
            # 解析: var hq_str_s_sh000001="上证指数,3000.00,-10.00,-0.33,..."
            try:
                code = line.split('=')[0].split('str_')[1]
                data = line.split('"')[1].split(',')
                
                if code in index_names:
                    name = index_names[code]
                    price = data[1]
                    change_pct = data[3]
                    icon = "🔴" if float(change_pct) >= 0 else "🟢"
                    result += f"{icon} {name}: {price} ({change_pct}%)\n"
            except Exception:
                continue  # 忽略解析失败的行
                
        return result
    except Exception as e:
        return f"大盘数据获取失败: {str(e)}"


def main(event=None, context=None) -> dict:
    """
    云函数入口函数，返回大盘行情概览。
    符合云函数标准返回格式
    """
    market_data = get_market_overview()
    
    # 返回标准 JSON 格式
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "message": market_data
        }, ensure_ascii=False)
    }