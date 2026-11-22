use crate::core::error::CoreResult;
use crate::ipc::dto::{
    FileContentDto, FileWriteResultDto, SftpEntryDto, SftpTransferJobDto,
};

use super::manager::SftpSessionManager;

impl SftpSessionManager {
    pub async fn remote_list_dir(
        &self,
        tab_id: &str,
        path: &str,
    ) -> CoreResult<(String, Vec<SftpEntryDto>)> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.list_dir(path).await
    }

    pub async fn remote_create_dir(
        &self,
        tab_id: &str,
        parent_dir: &str,
        name: &str,
    ) -> CoreResult<String> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.create_dir(parent_dir, name).await
    }

    pub async fn remote_create_file(
        &self,
        tab_id: &str,
        parent_dir: &str,
        name: &str,
    ) -> CoreResult<String> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.create_file(parent_dir, name).await
    }

    pub async fn remote_read_file(&self, tab_id: &str, path: &str) -> CoreResult<FileContentDto> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.read_text_file(path).await
    }

    pub async fn remote_write_file(
        &self,
        tab_id: &str,
        path: &str,
        content: &str,
    ) -> CoreResult<FileWriteResultDto> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.write_text_file(path, content).await
    }

    pub async fn remote_rename(
        &self,
        tab_id: &str,
        old_path: &str,
        new_name: &str,
    ) -> CoreResult<String> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.rename_entry(old_path, new_name).await
    }

    pub async fn remote_delete(&self, tab_id: &str, paths: Vec<String>) -> CoreResult<()> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.delete_entries(&paths).await
    }

    pub async fn remote_chmod(&self, tab_id: &str, path: &str, mode: u32) -> CoreResult<()> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.chmod(path, mode).await
    }

    pub async fn enqueue_uploads(
        &self,
        tab_id: &str,
        local_paths: Vec<String>,
        remote_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers
            .enqueue_uploads(local_paths, remote_dir, conflict_policy)
            .await
    }

    pub async fn enqueue_downloads(
        &self,
        tab_id: &str,
        remote_paths: Vec<String>,
        local_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers
            .enqueue_downloads(remote_paths, local_dir, conflict_policy)
            .await
    }

    pub fn pause_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.pause_job(job_id)
    }

    pub fn resume_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.resume_job(job_id)
    }

    pub fn cancel_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.cancel_job(job_id)
    }

    pub fn resolve_conflict(
        &self,
        tab_id: &str,
        conflict_id: &str,
        action: &str,
        apply_to_all: bool,
    ) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.resolve_conflict(conflict_id, action, apply_to_all)
    }

    pub fn list_transfers(&self, tab_id: &str) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        Ok(transfers.list_jobs())
    }

    pub fn clear_finished_transfers(&self, tab_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.clear_finished();
        Ok(())
    }
}
