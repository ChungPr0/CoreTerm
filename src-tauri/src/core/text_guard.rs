pub use crate::core::defaults::MAX_EDITABLE_FILE_BYTES;
use crate::core::error::{CoreError, CoreResult};

pub fn validate_editable_size(size: u64) -> CoreResult<()> {
    if size > MAX_EDITABLE_FILE_BYTES {
        return Err(CoreError::Validation(
            "File exceeds maximum editable size (2 MB)".to_string(),
        ));
    }
    Ok(())
}

pub fn decode_editable_utf8(bytes: Vec<u8>) -> CoreResult<String> {
    validate_editable_size(bytes.len() as u64)?;
    if bytes.contains(&0u8) {
        return Err(CoreError::Validation(
            "Binary or non-UTF-8 file cannot be edited".to_string(),
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        CoreError::Validation("Binary or non-UTF-8 file cannot be edited".to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_valid_utf8_text_including_vietnamese() {
        let text = "Xin chào CoreTerm!\nline 2\r\n";
        let decoded = decode_editable_utf8(text.as_bytes().to_vec()).expect("valid utf8");
        assert_eq!(decoded, text);
    }

    #[test]
    fn allows_empty_file() {
        let decoded = decode_editable_utf8(Vec::new()).expect("empty file");
        assert_eq!(decoded, "");
    }

    #[test]
    fn rejects_nul_byte_anywhere_in_file() {
        let err = decode_editable_utf8(b"hello\0world".to_vec()).unwrap_err();
        assert!(err.to_string().contains("Binary or non-UTF-8"));

        let mut late_nul = vec![b'a'; 16_384];
        late_nul.push(0);
        late_nul.extend_from_slice(b"tail");
        let err_late = decode_editable_utf8(late_nul).unwrap_err();
        assert!(err_late.to_string().contains("Binary or non-UTF-8"));
    }

    #[test]
    fn rejects_invalid_utf8_bytes() {
        let err = decode_editable_utf8(vec![0xff, 0xfe, 0xfd]).unwrap_err();
        assert!(err.to_string().contains("Binary or non-UTF-8"));
    }

    #[test]
    fn rejects_file_larger_than_2mb() {
        let err = validate_editable_size(MAX_EDITABLE_FILE_BYTES + 1).unwrap_err();
        assert!(err.to_string().contains("maximum editable size (2 MB)"));

        let oversized = vec![b'a'; (MAX_EDITABLE_FILE_BYTES as usize) + 1];
        let err2 = decode_editable_utf8(oversized).unwrap_err();
        assert!(err2.to_string().contains("maximum editable size (2 MB)"));
    }
}
