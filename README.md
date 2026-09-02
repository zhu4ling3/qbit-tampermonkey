# qbit-tampermonkey
捕获 PT 站点的 Torrent/Magnet 链接，支持筛选、批量检查并发送到 qBittorrent。
基于 `https://github.com/joshkerr/qbit-tampermonkey`， 但是做了大量的特性修改。

# qBittorrent Torrent Interceptor

适用于 Firefox + Tampermonkey 的 PT 辅助脚本，用于从 NexusPHP 架构的 PT 网站捕获 Torrent/Magnet 链接，并通过 qBittorrent Web API 添加下载任务。

当前已针对 `springsunday.net` 进行适配。

## 页面捕获

### `torrents.php`

- 扫描种子列表中的 Torrent/Magnet 链接。
- 从同一表格行提取英文名称和中文名称。
- SpringSunday 的 Torrent URL 必须包含非空 `passkey`。
- 点击单个链接时，只将该 Torrent 带入添加对话框。
- 通过右键菜单扫描时，将页面中的全部 Torrent 带入批量添加对话框。

### `details.php`

- 从“下载”行提取 Torrent 文件名称。
- 从“副标题”行提取中文或英文副标题。
- 根据种子 ID，将展示链接与带有 `passkey` 的真实下载链接配对。

### `userdetails.php`

- 从用户种子记录中识别带文字标题的 `details.php` 入口。
- 自动访问对应详情页，再提取真实 Torrent 下载链接。
- 最多并发处理 4 个详情页，并对结果去重。
- 仅处理当前页面显示的记录，不会自动翻页。

## 批量添加

批量添加对话框支持：

- 多选、全选 Torrent。
- 按资源名称或 URL 筛选。
- 多个筛选条件以空格分隔，条件之间为“并且”关系。
- 指定 qBittorrent 分类。
- 设置本次添加后是否立即启动。
- 设置本次是否跳过 Hash 校验。
- 检查 Torrent 是否已经存在于 qBittorrent。
- 仅添加筛选后可见且已选中的项目。
- 显示每个项目的添加状态以及最终成功、失败数量。

## qBittorrent 功能

脚本通过 qBittorrent Web API 支持：

- WebUI 登录及会话失效后自动重新登录。
- 测试 qBittorrent 连接并读取版本。
- 获取现有分类列表。
- 获取现有 Torrent 的 InfoHash。
- 添加 Magnet 或 Torrent URL。
- 下载 PT Torrent 文件后上传到 qBittorrent。
- 直接下载失败时退回 URL 添加方式。
- 设置保存路径、分类、标签和自动 Torrent 管理。
- 控制添加后立即启动。
- 使用 `skip_checking` 跳过 Hash 校验。

## Torrent 存在性检查

- Torrent 文件：解析 Bencode `info` 字典并计算 SHA-1、SHA-256。
- Magnet：支持十六进制/Base32 BTIH 和 BTMH。
- 与 qBittorrent 中的 `hash`、`infohash_v1`、`infohash_v2` 进行比较。

## 扩展其他站点

站点专用逻辑通过适配器组织，每个适配器可以分别定义：

- `matches`：匹配站点域名。
- `isTorrentLink`：判断 Torrent URL。
- `getTorrentName`：提取中英文资源名称。
- `collect`：实现列表页、详情页等特殊采集流程。

## 安全提示

Torrent URL 可能包含私密 `passkey`，请勿将完整链接、日志或截图公开分享。
