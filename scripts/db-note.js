/**
 * db 脚本占位。索引库（SQLite）在 M2 复习/检索模块接入，
 * 届时 db:init / db:migrate 由主进程迁移器执行（含 Electron ABI 的 better-sqlite3）。
 */
const [cmd] = process.argv.slice(2)
console.log(`[db:${cmd ?? '?'}] 占位——索引库迁移将在 M2 主进程内实现`)
