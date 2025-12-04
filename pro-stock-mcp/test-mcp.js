#!/usr/bin/env node

import { spawn } from "child_process";
import { createInterface } from "readline";

/**
 * 测试 MCP 服务器
 */
function testMCPServer() {
  console.log("🚀 启动 MCP 服务器测试...\n");

  // 启动服务器进程
  const server = spawn("node", ["index.js"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let messageId = 1;

  // 处理标准输出
  const rl = createInterface({
    input: server.stdout,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    console.log("📨 服务器回复:", line);
  });

  // 处理错误输出
  server.stderr.on("data", (data) => {
    console.log("📝 服务器日志:", data.toString());
  });

  // 1. 发送 Initialize 请求
  console.log("1️⃣  发送 Initialize 请求...");
  const initRequest = {
    jsonrpc: "2.0",
    id: messageId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  server.stdin.write(JSON.stringify(initRequest) + "\n");

  // 等待一秒后发送 ListTools 请求
  setTimeout(() => {
    console.log("\n2️⃣  发送 ListTools 请求...");
    const listToolsRequest = {
      jsonrpc: "2.0",
      id: messageId++,
      method: "tools/list",
    };

    server.stdin.write(JSON.stringify(listToolsRequest) + "\n");
  }, 1000);

  // 等待两秒后关闭
  setTimeout(() => {
    console.log("\n\n✅ 测试完成");
    server.kill();
    process.exit(0);
  }, 3000);

  // 处理错误
  server.on("error", (error) => {
    console.error("❌ 服务器启动错误:", error);
    process.exit(1);
  });
}

testMCPServer();
