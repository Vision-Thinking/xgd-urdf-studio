# 第一阶段部署验证

> 日期：2026-08-22
> 执行者：Codex
> 上游基线：`OpenLegged/URDF-Studio@cce429264820e7fea90609360e05463b9a381a38`

## 结论

`xgd-urdf-studio` 已在不改写核心编辑器的前提下完成独立 Docker/Nginx HTTPS 部署。可信证书、跨源隔离、SharedArrayBuffer、WASM、Worker、URDF 编辑、组件拼接、导入导出和多层 USD 加载均通过本地自动验证。

## 可复现命令

```powershell
# 完整代码质量回归
npm run verify:fast

# 独立构建与启动；正式环境替换镜像标签、端口和证书变量
docker compose build urdf-studio
docker compose up -d --no-deps urdf-studio

# 严格校验证书和部署契约
npm run test:deployment:https -- `
  --url https://localhost:8320 `
  --ca-cert <可信测试 CA 或正式 CA 文件>
```

## 已验证结果

| 项目 | 结果 |
| --- | --- |
| `npm run verify:fast` | 通过；49/49 单元测试，5,234 个模块完成生产构建 |
| 镜像 | `xgd-urdf-studio:issue-1-test`，ID `sha256:c485ef63b459555c483d05b888dd9bd106fb559dca1d32cf63ea3e94f0176bf9` |
| Nginx | `nginx -t` 成功，容器健康状态 `healthy` |
| 运行身份 | UID/GID 101，非 root |
| 挂载 | 仅 TLS 证书与私钥，均只读 |
| HTTPS | mkcert 测试证书由本机信任根严格校验通过 |
| 隔离 | COOP/COEP/CORP 生效，`crossOriginIsolated=true` |
| 浏览器能力 | `isSecureContext=true`，SharedArrayBuffer/Worker 可用 |
| OpenUSD | JS/data/WASM 均 200；WASM MIME 正确；USD 工作区加载成功 |
| URDF | Link/Joint/XYZ-RPY/Visual/Collision 编辑通过 |
| Assembly | 双组件固定拼接与 URDF ZIP 导出通过 |
| AI | 构建不需要 Key，最终镜像环境不含 AI Key/后端变量 |

## 浏览器证据

- `output/playwright/xgd-upstream-baseline-joint-xyz-rpy.png`
- `output/playwright/xgd-upstream-baseline-usd-loaded.png`
- `output/playwright/xgd-container-https-assembly.png`
- `output/playwright/xgd-container-https-usd-loaded.png`

测试期间本机默认端口 8320 已由一个用户进程占用，因此容器端到端测试使用 18320；没有停止、重启或修改该用户进程。默认 Compose 契约仍为 8320。
