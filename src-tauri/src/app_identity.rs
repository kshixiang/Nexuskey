//! Application identity constants for the NexusKey fork.
//!
//! These values intentionally differ from upstream CC Switch so both apps can
//! coexist on the same machine without sharing config, database, deep links,
//! or the default proxy port.

pub const APP_PRODUCT_NAME: &str = "NexusKey";
pub const APP_CONFIG_DIR_NAME: &str = ".nexuskey";
pub const APP_DB_FILE_NAME: &str = "nexuskey.db";
pub const APP_LOG_FILE_STEM: &str = "nexuskey";
pub const APP_DEEPLINK_SCHEME: &str = "nexuskey";
pub const APP_DEEPLINK_PREFIX: &str = "nexuskey://";
pub const LEGACY_DEEPLINK_SCHEME: &str = "ccswitch";
pub const LEGACY_DEEPLINK_PREFIX: &str = "ccswitch://";
pub const APP_CODEX_MODEL_PROVIDER_ID: &str = "nexuskey";
pub const APP_WEBDAV_REMOTE_ROOT: &str = "nexuskey-sync";
pub const APP_DEFAULT_PROXY_PORT: u16 = 15731;

/// Linux：`tauri-plugin-deep-link` 在 `data_dir()/applications/` 下写入的 handler 文件名（与 bundle identifier 配套）。
#[cfg(target_os = "linux")]
pub const APP_LINUX_DEEPLINK_HANDLER_DESKTOP: &str = "nexuskey-handler.desktop";

pub fn is_supported_deeplink_url(url: &str) -> bool {
    url.starts_with(APP_DEEPLINK_PREFIX) || url.starts_with(LEGACY_DEEPLINK_PREFIX)
}
