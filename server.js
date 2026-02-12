/**
 * 零依赖本地预览服务器：
 * - 静态：GET /
 * - API：POST /api/generate
 *
 * 运行：node server.js（会自动读取 .env 文件）
 * 或者：DEEPSEEK_API_KEY=xxx node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// 自动读取 .env 文件（零依赖实现）
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        if (key && values.length > 0) {
          const value = values.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (e) {
  // 忽略 .env 读取错误
}

const apiGenerate = require("./api/generate.js");

const PORT = Number(process.env.PORT || 8787);
const INDEX_PATH = path.join(__dirname, "index.html");

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // 防止过大 body
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(INDEX_PATH, "utf8");
      return send(res, 200, { "Content-Type": "text/html; charset=utf-8" }, html);
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, { "Content-Type": "text/plain; charset=utf-8" }, "ok");
    }

    if (url.pathname === "/api/generate") {
      if (req.method !== "POST") {
        return send(
          res,
          405,
          { "Content-Type": "application/json; charset=utf-8" },
          JSON.stringify({ error: "Method Not Allowed" })
        );
      }

      req.body = await readJson(req);
      return apiGenerate(req, res);
    }

    // 简单静态文件兜底（只允许同目录文件，避免目录穿越）
    if (req.method === "GET") {
      const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(__dirname, safePath);
      if (filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === ".html"
            ? "text/html; charset=utf-8"
            : ext === ".js"
              ? "text/javascript; charset=utf-8"
              : ext === ".css"
                ? "text/css; charset=utf-8"
                : "application/octet-stream";
        const buf = fs.readFileSync(filePath);
        return send(res, 200, { "Content-Type": type }, buf);
      }
    }

    return send(
      res,
      404,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({ error: "Not Found" })
    );
  } catch (e) {
    return send(
      res,
      500,
      { "Content-Type": "application/json; charset=utf-8" },
      JSON.stringify({ error: e?.message || "Server error" })
    );
  }
});

// 获取本机局域网 IP（用于移动端访问）
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n✅ 服务器已启动！`);
  console.log(`\n📱 移动端访问方式：`);
  console.log(`   1. 确保手机和电脑连接在同一个 WiFi 网络`);
  console.log(`   2. 在手机浏览器打开：http://${localIP}:${PORT}`);
  console.log(`\n💻 电脑端访问：`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n💡 提示：如果移动端无法访问，请检查防火墙设置`);
  console.log(`   环境变量 DEEPSEEK_API_KEY 已${process.env.DEEPSEEK_API_KEY ? '✅ 设置' : '❌ 未设置'}\n`);
});

