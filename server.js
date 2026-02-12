/**
 * 生产环境通用服务器 (适配 微信云托管 / Zeabur / Vercel)
 * - 静态服务：GET /
 * - 接口服务：POST /api/generate
 * - 微信验证：GET /beaec79ae333ba4c3e53452c470b6f70.txt (申诉用)
 * - 小程序验证：GET /ZF32dQh8cA.txt (业务域名用)
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
    // 获取请求路径（兼容低版本 Node）
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const url = new URL(req.url, `${protocol}://${host}`);

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
    // 3. 微信部署验证文件 (旧：用于申诉)
    // ---------------------------------------------------------
    if (req.method === "GET" && url.pathname === "/beaec79ae333ba4c3e53452c470b6f70.txt") {
      return send(res, 200, { "Content-Type": "text/plain; charset=utf-8" }, "468443f13357ffa505c1afc4d51e9adb0f9f30b6");
    }

    // ---------------------------------------------------------
    // 4. 小程序业务域名验证文件 (🔥 新增：用于 web-view 绑定)
    // ---------------------------------------------------------
    // ⚠️ 这个文件名必须和你下载的一模一样，内容也是！
    if (req.method === "GET" && url.pathname === "/ZF32dQh8cA.txt") {
      return send(
        res, 
        200, 
        { "Content-Type": "text/plain; charset=utf-8" }, 
        "17c20564a3d6c5fa506468d339dcea41" 
      );
    }

    // 5. API 接口
    if (url.pathname === "/api/generate") {
      if (req.method !== "POST") {
        return send(res, 405, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Method Not Allowed" }));
      }
      try {
        req.body = await readJson(req);
        return await apiGenerate(req, res);
      } catch (err) {
        return send(res, 400, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: err.message }));
      }
    }

    // 6. 静态资源文件支持 (兜底)
    if (req.method === "GET") {
      // 安全处理路径，防止目录穿越
      const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      // 尝试匹配根目录下的文件
      const filePath = path.join(__dirname, safePath);
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === ".html" ? "text/html; charset=utf-8" :
          ext === ".js" ? "text/javascript; charset=utf-8" :
          ext === ".css" ? "text/css; charset=utf-8" : 
          ext === ".txt" ? "text/plain; charset=utf-8" : // 确保 txt 文件也能被直接读取
          "application/octet-stream";
        const buf = fs.readFileSync(filePath);
        return send(res, 200, { "Content-Type": type }, buf);
      }
    }

    return send(res, 404, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Not Found" }));
  } catch (e) {
    console.error(e);
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