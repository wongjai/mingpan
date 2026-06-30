# mingpan fork（含 bazi_manifestation + 內化 liuyao schema fix）
# 由本地 fork source 構建，取代原本 `npm i -g mingpan@0.1.3`
FROM node:22-alpine
WORKDIR /app

# 先裝依賴（利用 layer cache）；--ignore-scripts 跳過 package.json 的 prepare(=tsc)，
# 因為此層尚未 COPY src，build 留待下方手動執行
COPY package.json package-lock.json tsconfig.json ./
RUN npm install --ignore-scripts

# 編譯 TypeScript → dist
COPY src ./src
RUN npm run build

# 內置原生 Streamable HTTP（stateless）入口，取代 supergateway：
# sessionIdGenerator=undefined + enableJsonResponse → 重啟/閒置都不會令 ChatGPT 端 session 失效，
# 亦避開 Cloudflare Tunnel 對長連線的 idle timeout
ENV MCP_HTTP=1
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "/app/dist/index.js", "--http"]
