#[cfg(windows)]
mod launcher;
#[cfg(windows)]
mod pipe;
pub mod protocol;
mod worker;

pub const ELEVATED_PTY_FLAG: &str = "--coreterm-elevated-pty";

#[cfg(windows)]
pub use launcher::spawn_elevated_pty;
#[cfg(windows)]
pub use pipe::{ElevatedPtyConnection, OverlappedPipe, PipeReader, PipeWriter};
pub use protocol::{
    read_frame, write_frame, FRAME_CLOSE, FRAME_DATA, FRAME_ERROR, FRAME_EXIT, FRAME_RESIZE,
};
pub use worker::run_elevated_worker;
