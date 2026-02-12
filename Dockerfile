# 1. 使用官方 Node.js 轻量级镜像
FROM node:18-alpine

# 2. 设置工作目录
WORKDIR /app

# 3. 复制依赖文件并安装
COPY package*.json ./
RUN npm install

# 4. 复制所有项目文件
COPY . .

# 5. 暴露 80 端口 (微信云托管强制要求)
EXPOSE 80

# 6. 启动命令
CMD ["npm", "start"]