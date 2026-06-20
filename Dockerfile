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

# supergateway 將 stdio MCP 包成 Streamable HTTP
RUN npm install -g supergateway

EXPOSE 8000
CMD ["supergateway","--stdio","node /app/dist/index.js","--outputTransport","streamableHttp","--streamableHttpPath","/mcp","--port","8000"]
