docker build -t mcp-service .

docker run -d -p 8000:8000 --name stock-mcp --restart always mcp-service
fb01248999c130d3daeac8e540dd4ae8a7efe0a987192d50c5f3b73bd67bdef5

docker logs -f stock-mcp

