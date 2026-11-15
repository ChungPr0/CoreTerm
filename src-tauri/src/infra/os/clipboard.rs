#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
const CF_UNICODETEXT: u32 = 13;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
#[cfg(windows)]
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
};
#[cfg(windows)]
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

#[cfg(windows)]
fn open_clipboard_with_retry() -> Result<(), String> {
    for attempt in 0..8 {
        let opened = unsafe { OpenClipboard(std::ptr::null_mut()) };
        if opened != 0 {
            return Ok(());
        }
        if attempt < 7 {
            std::thread::sleep(Duration::from_millis(12));
        }
    }
    Err("Failed to open Windows clipboard".to_string())
}

pub fn read_text() -> Result<String, String> {
    #[cfg(windows)]
    {
        open_clipboard_with_retry()?;
        let result = unsafe {
            let handle: HANDLE = GetClipboardData(CF_UNICODETEXT);
            if handle.is_null() {
                Ok(String::new())
            } else {
                let ptr = GlobalLock(handle as HGLOBAL) as *const u16;
                if ptr.is_null() {
                    Ok(String::new())
                } else {
                    let mut len = 0usize;
                    while *ptr.add(len) != 0 {
                        len += 1;
                    }
                    let slice = std::slice::from_raw_parts(ptr, len);
                    let text = String::from_utf16_lossy(slice);
                    let _ = GlobalUnlock(handle as HGLOBAL);
                    Ok(text)
                }
            }
        };
        unsafe {
            let _ = CloseClipboard();
        }
        result
    }

    #[cfg(not(windows))]
    Ok(String::new())
}

pub fn write_text(text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        open_clipboard_with_retry()?;
        let result = unsafe {
            if EmptyClipboard() == 0 {
                Err("Failed to clear Windows clipboard".to_string())
            } else {
                let mut wide: Vec<u16> = text.encode_utf16().collect();
                wide.push(0);
                let byte_len = wide.len() * std::mem::size_of::<u16>();
                let hmem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, byte_len);
                if hmem.is_null() {
                    Err("Failed to allocate global memory for clipboard".to_string())
                } else {
                    let dst = GlobalLock(hmem) as *mut u16;
                    if dst.is_null() {
                        let _ = GlobalFree(hmem);
                        Err("Failed to lock clipboard memory".to_string())
                    } else {
                        std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
                        let _ = GlobalUnlock(hmem);
                        if SetClipboardData(CF_UNICODETEXT, hmem as HANDLE).is_null() {
                            let _ = GlobalFree(hmem);
                            Err("Failed to set Windows clipboard data".to_string())
                        } else {
                            // Clipboard takes ownership of hmem on success.
                            Ok(())
                        }
                    }
                }
            }
        };
        unsafe {
            let _ = CloseClipboard();
        }
        result
    }

    #[cfg(not(windows))]
    {
        let _ = text;
        Ok(())
    }
}
