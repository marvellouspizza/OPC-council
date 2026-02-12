# Silent Council - SecondMe 集成项目

## 应用信息

- **App Name**: Silent Council
- **Client ID**: c5c87dcd-e17e-****-****-************ (部分隐藏)

## API 文档

开发时请参考官方文档：

| 文档 | 链接 |
|------|------|
| 快速入门 | https://develop-docs.second.me/zh/docs |
| OAuth2 认证 | https://develop-docs.second.me/zh/docs/authentication/oauth2 |
| API 参考 | https://develop-docs.second.me/zh/docs/api-reference/secondme |
| 错误码 | https://develop-docs.second.me/zh/docs/errors |

## 关键信息

- **API 基础 URL**: https://app.mindos.com/gate/lab
- **OAuth 授权 URL**: https://go.second.me/oauth/
- **Access Token 有效期**: 2 小时
- **Refresh Token 有效期**: 30 天

> 所有 API 端点配置请参考 `.secondme/state.json` 中的 `api` 和 `docs` 字段

## 已选模块

- ✅ **auth** - OAuth 认证
- ✅ **profile** - 用户信息展示（头像、兴趣标签、软记忆）
- ✅ **chat** - 聊天功能
- ✅ **act** - 结构化动作判断（情感分析、意图识别）
- ✅ **note** - 笔记功能

## 权限列表 (Scopes)

| 权限 | 说明 | 状态 |
|------|------|------|
| `user.info` | 用户基础信息 | ✅ 已授权 |
| `user.info.shades` | 用户兴趣标签 | ✅ 已授权 |
| `user.info.softmemory` | 用户软记忆 | ✅ 已授权 |
| `chat` | 聊天功能 | ✅ 已授权 |
| `note.add` | 添加笔记 | ✅ 已授权 |

## 数据库

- **类型**: PostgreSQL (Supabase)
- **连接**: 配置在 `.env.local` 中

## 重要提醒

⚠️ **请将 `.secondme/` 目录添加到 `.gitignore` 以保护敏感信息！**
