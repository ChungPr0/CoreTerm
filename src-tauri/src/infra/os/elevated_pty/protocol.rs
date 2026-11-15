use std::io::{self, Read, Write};

pub const FRAME_DATA: u8 = 1;
pub const FRAME_RESIZE: u8 = 2;
pub const FRAME_EXIT: u8 = 3;
pub const FRAME_ERROR: u8 = 4;
pub const FRAME_CLOSE: u8 = 5;

const MAX_FRAME_LEN: usize = 16 * 1024 * 1024;

pub fn write_frame<W: Write>(writer: &mut W, tag: u8, payload: &[u8]) -> io::Result<()> {
    let len = u32::try_from(payload.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Frame exceeds u32 max"))?;
    let mut header = [0u8; 5];
    header[0] = tag;
    header[1..5].copy_from_slice(&len.to_le_bytes());
    writer.write_all(&header)?;
    if !payload.is_empty() {
        writer.write_all(payload)?;
    }
    writer.flush()?;
    Ok(())
}

pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Option<(u8, Vec<u8>)>> {
    let mut header = [0u8; 5];
    match reader.read_exact(&mut header) {
        Ok(()) => {}
        Err(e)
            if e.kind() == io::ErrorKind::UnexpectedEof
                || e.kind() == io::ErrorKind::BrokenPipe =>
        {
            return Ok(None);
        }
        Err(e) => return Err(e),
    }

    let tag = header[0];
    let len = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
    if len > MAX_FRAME_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Elevated PTY frame too large: {len}"),
        ));
    }

    let mut payload = vec![0u8; len];
    if len > 0 {
        reader.read_exact(&mut payload)?;
    }
    Ok(Some((tag, payload)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_frame_roundtrip_and_eof() {
        let mut buf = Vec::new();
        write_frame(&mut buf, FRAME_DATA, b"hello admin pty").unwrap();
        write_frame(&mut buf, FRAME_RESIZE, &[120, 0, 30, 0]).unwrap();
        write_frame(&mut buf, FRAME_CLOSE, &[]).unwrap();

        let mut cursor = Cursor::new(buf);
        assert_eq!(
            read_frame(&mut cursor).unwrap(),
            Some((FRAME_DATA, b"hello admin pty".to_vec()))
        );
        assert_eq!(
            read_frame(&mut cursor).unwrap(),
            Some((FRAME_RESIZE, vec![120, 0, 30, 0]))
        );
        assert_eq!(read_frame(&mut cursor).unwrap(), Some((FRAME_CLOSE, vec![])));
        assert_eq!(read_frame(&mut cursor).unwrap(), None);
    }
}
