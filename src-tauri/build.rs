fn main() {
    tauri_build::build();
    // Test harnesses link comctl32!TaskDialogIndirect (via rfd) without coreterm.exe's .rsrc manifest.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
        // Preserve tauri-winres manifest on bin targets so resource.lib and /MANIFEST:EMBED do not clash.
        println!("cargo:rustc-link-arg-bins=/MANIFEST:NO");
    }
}
