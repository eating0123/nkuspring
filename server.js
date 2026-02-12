/**
 * 生产环境通用服务器 (适配 微信云托管 / Zeabur / Vercel)
 * - 静态服务：GET /
 * - 接口服务：POST /api/generate
 * - 微信验证：GET /beaec79ae333ba4c3e53452c470b6f70.txt
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- 1. 自动读取 .env 文件 ---
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
} catch (e) {}

const apiGenerate = require("./api/generate.js");

const PORT = Number(process.env.PORT || 80); 
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

    // 1. 静态主页
    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(INDEX_PATH, "utf8");
      return send(res, 200, { "Content-Type": "text/html; charset=utf-8" }, html);
    }

    // 2. 健康检查
    if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/check")) {
      return send(res, 200, { "Content-Type": "text/plain; charset=utf-8" }, "ok");
    }

    // ---------------------------------------------------------
    // 3. 微信部署验证文件 (新增部分)
    // ---------------------------------------------------------
    if (req.method === "GET" && url.pathname === "/beaec79ae333ba4c3e53452c470b6f70.txt") {
      return send(
        res, 
        200, 
        { "Content-Type": "text/plain; charset=utf-8" }, 
        "468443f13357ffa505c1afc4d51e9adb0f9f30b6"
      );
    }

    // 4. API 接口
    if (url.pathname === "/api/generate") {
      if (req.method !== "POST") {
        return send(res, 405, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Method Not Allowed" }));
      }
      req.body = await readJson(req);
      return apiGenerate(req, res);
    }

    // 5. 静态资源文件支持
    if (req.method === "GET") {
      const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(__dirname, safePath);
      if (filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === ".html" ? "text/html; charset=utf-8" :
          ext === ".js" ? "text/javascript; charset=utf-8" :
          ext === ".css" ? "text/css; charset=utf-8" : 
          "application/octet-stream";
        const buf = fs.readFileSync(filePath);
        return send(res, 200, { "Content-Type": type }, buf);
      }
    }

    return send(res, 404, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Not Found" }));
  } catch (e) {
    return send(res, 500, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: e?.message || "Server error" }));
  }
});

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🚀 服务器已启动！`);
  console.log(`   公网/局域网访问: http://${localIP}:${PORT}`);
});