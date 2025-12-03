FROM bitnami/python:3.10

WORKDIR /app
COPY requirements.txt .
RUN pip install -i https://mirrors.aliyun.com/pypi/simple/ --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 8000
CMD ["fastmcp", "run", "src/server.py", "--transport", "sse", "--host", "0.0.0.0", "--port", "8000"]