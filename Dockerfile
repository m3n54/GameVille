# GameVille backend — Hugging Face Spaces (Docker SDK)
# Structure:
#   /app/server   <- server/src + server/package.json (tsconfig rootDir is "..")
#   /app/shared   <- shared/types.ts (imported by server as ../../shared)
FROM node:20-alpine

WORKDIR /app
COPY server ./server
COPY shared ./shared

WORKDIR /app/server
RUN npm install
RUN npm run build

# Hugging Face Spaces injects PORT=7860. The server reads process.env.PORT,
# so it binds there automatically. Default 7860 below is a fallback.
ENV PORT=7860
EXPOSE 7860

CMD ["node", "dist/server/src/index.js"]
