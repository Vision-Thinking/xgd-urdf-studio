# XGD Fork 上游基线

> 冻结日期：2026-08-21；执行者：Codex。

| 项目            | 值                                                   |
| --------------- | ---------------------------------------------------- |
| 上游仓库        | `https://github.com/OpenLegged/URDF-Studio`          |
| XGD Fork        | `https://github.com/Vision-Thinking/xgd-urdf-studio` |
| 冻结提交        | `cce429264820e7fea90609360e05463b9a381a38`           |
| 本地上游 remote | `upstream`                                           |
| 基线 tag        | `upstream-baseline-2026-08-21`                       |

`main` 与 `dev` 在建仓时都对齐到上述提交。XGD 的部署改动从 `dev` 派生，不复制
源码到 `isaac-sim-env/studio/`，也不重写 URDF Studio 核心编辑器。

## 基线验证

- Node.js `22.23.2` 下 49/49 单元测试通过。
- 生产构建通过，`dist/usd/bindings/` 包含 `.js`、`.wasm`、`.data` 与
  `.worker.js` 四个 OpenUSD runtime 文件。
- Chromium 严格加载测试 URDF：3 个 Link、2 个 Joint；验证 XYZ/RPY、Visual、
  Collision、双组件 Assembly、bridge joint 与 URDF ZIP 导出。
- Chromium 实际加载独立 USDA，OpenUSD WASM/Worker 请求返回 200，页面状态为
  `isSecureContext=true`、`crossOriginIsolated=true`、`SharedArrayBuffer` 可用。
- 基线发现一处不影响运行但会阻断 ESLint 的未使用循环变量；Fork 仅将该循环改为
  `Object.values()`，没有改变解析行为。

## 后续同步原则

同步上游时先在独立分支比较 `upstream/main` 与当前 `dev`，保留 Docker/Nginx 与
部署文档层的 XGD 差异。核心编辑器冲突必须优先采用上游实现；不得借同步之机做
无关重构。
