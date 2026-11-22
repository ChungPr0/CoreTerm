/// Strips ANSI CSI/OSC escape sequences from raw ConPTY stream chunks while preserving line breaks.
pub fn strip_ansi(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1B {
            i += 1;
            if i >= bytes.len() {
                break;
            }
            if bytes[i] == b'[' {
                i += 1;
                while i < bytes.len() && !(0x40..=0x7E).contains(&bytes[i]) {
                    i += 1;
                }
                if i < bytes.len() {
                    // Preserve line separation on ConPTY cursor-position / next-line sequences.
                    if matches!(bytes[i], b'H' | b'f' | b'E' | b'G') && !out.ends_with('\n') {
                        out.push('\n');
                    }
                    i += 1;
                }
            } else if bytes[i] == b']' {
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if bytes[i] == 0x1B && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
            } else {
                i += 1;
            }
            continue;
        }
        if bytes[i] == b'\r' {
            if !out.ends_with('\n') {
                out.push('\n');
            }
            i += 1;
            if i < bytes.len() && bytes[i] == b'\n' {
                i += 1;
            }
            continue;
        }
        let ch = raw[i..].chars().next().unwrap_or('\0');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}
