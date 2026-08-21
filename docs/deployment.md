# XGD URDF Studio 独立部署

> 最近验证：2026-08-22；执行者：Codex。

本仓库只负责机器人资产内部设计与装配。镜像不包含、也不挂载
`isaac-sim-env/assets/devices`，不会读取或修改 `scene.yaml`。跨仓库“导出到 ICSIM
ENV”属于后续阶段，不在当前部署契约内。

## 部署契约

- 容器内仅监听 HTTPS `8443`，宿主机默认映射为 `8320`。
- TLS 证书和私钥只在运行时挂载到 `/etc/nginx/tls/tls.crt` 与
  `/etc/nginx/tls/tls.key`，不会被复制进镜像。
- `URDF_STUDIO_PUBLIC_URL` 是供外部系统打开本应用的公开地址；当前仓库不会把它
  编译进前端，因此可以在部署时替换域名和端口。
- Nginx 对所有响应返回 `COOP: same-origin`、`COEP: require-corp` 和
  `CORP: same-site`。官方 `mime.types` 提供 `application/wasm`，静态 Worker、WASM
  或数据文件缺失时直接返回 404，不会回退为 HTML。
- 带内容哈希的 Vite 资源使用长期缓存；文件名固定的 OpenUSD bindings 使用
  `no-cache` 重验证，避免升级镜像后 JS、WASM、data 与 Worker 版本错配。
- Docker 构建显式清空 AI Key 与 AI 后端地址；上游 AI 菜单保留，但第一阶段没有
  可调用的 AI 提供方。普通 URDF/MJCF/USD 编辑、装配和导入导出均不依赖 AI。

## 可信开发证书

使用标准工具 `mkcert`，不要把 `.dev-certs/` 提交到 Git：

```bash
mkcert -install
mkdir -p .dev-certs
mkcert \
  -cert-file .dev-certs/tls.crt \
  -key-file .dev-certs/tls.key \
  localhost 127.0.0.1 ::1
```

局域网验证时，把实际主机名或 IP 一并写入最后一条命令。正式部署只需把下列两个
变量改成正式证书路径，无需重建镜像：

```dotenv
URDF_STUDIO_TLS_CERT_PATH=/absolute/path/to/fullchain.pem
URDF_STUDIO_TLS_KEY_PATH=/absolute/path/to/privkey.pem
```

运行时使用非 root Nginx；证书文件必须允许容器内 UID `101` 读取。若正式私钥默认仅
root 可读，应通过宿主机证书组或 ACL 授予只读权限，不要把私钥复制进镜像。

## 构建与独立启动

```bash
cp .env.example .env
docker compose build urdf-studio
docker compose up -d --no-deps urdf-studio
docker compose ps urdf-studio
```

更新 URDF Studio 时只操作这个服务：

```bash
docker compose pull urdf-studio
docker compose up -d --no-deps urdf-studio
```

这不会创建、停止或重建 Isaac Sim 与 8318 Studio 容器。

## 部署验收

先验证响应头、MIME、TLS 信任与静态资源 404 语义：

```bash
npm run test:deployment:https -- \
  --url "${URDF_STUDIO_PUBLIC_URL}" \
  --ca-cert "$(mkcert -CAROOT)/rootCA.pem"
```

再用 Chromium 打开 `URDF_STUDIO_PUBLIC_URL`，在控制台确认：

```js
({
  secure: window.isSecureContext,
  isolated: window.crossOriginIsolated,
  sharedArrayBuffer: typeof window.SharedArrayBuffer === 'function',
});
```

三个值必须都为 `true`。随后实际导入一个 USD/USDA 文件，确认
`emHdBindings.js`、`.wasm`、`.data`、`.worker.js` 与应用 Worker 均返回 200，且
场景树和画布完成更新。仅看到首页不属于 USD 验收通过。

## 正式部署变量

| 变量                         | 默认值                   | 用途                   |
| ---------------------------- | ------------------------ | ---------------------- |
| `URDF_STUDIO_IMAGE`          | `xgd-urdf-studio:dev`    | 独立镜像引用           |
| `URDF_STUDIO_CONTAINER_NAME` | `urdf-studio`            | 容器名                 |
| `URDF_STUDIO_BIND_ADDRESS`   | `0.0.0.0`                | 宿主机监听地址         |
| `URDF_STUDIO_HTTPS_PORT`     | `8320`                   | 宿主机 HTTPS 端口      |
| `URDF_STUDIO_PUBLIC_URL`     | `https://localhost:8320` | 8318 Studio 新窗口地址 |
| `URDF_STUDIO_TLS_CERT_PATH`  | `./.dev-certs/tls.crt`   | 证书文件               |
| `URDF_STUDIO_TLS_KEY_PATH`   | `./.dev-certs/tls.key`   | 私钥文件               |

正式域名、证书路径和镜像 tag 均是部署变量，不属于源码常量。

## 部署依据

- MDN：
  [SharedArrayBuffer 的安全要求](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)
  说明安全上下文、COOP/COEP 与跨源隔离要求。
- Nginx 官方源码：
  [mime.types](https://github.com/nginx/nginx/blob/master/conf/mime.types)
  定义 `.wasm` 的 `application/wasm` MIME。
- Nginx 官方镜像项目：
  [nginx-unprivileged](https://github.com/nginx/docker-nginx-unprivileged)
  是本镜像非 root 运行时的来源。
