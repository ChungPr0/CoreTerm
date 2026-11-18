use std::path::Path;

use crate::core::error::{CoreError, CoreResult};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree, ERROR_SUCCESS, GENERIC_READ, GENERIC_WRITE, HANDLE, HLOCAL},
    Security::{
        Authorization::{
            SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
            SE_FILE_OBJECT, SET_ACCESS, TRUSTEE_IS_SID, TRUSTEE_IS_USER, TRUSTEE_W,
        },
        GetTokenInformation, TokenUser, ACL, DACL_SECURITY_INFORMATION, NO_INHERITANCE,
        PROTECTED_DACL_SECURITY_INFORMATION, TOKEN_QUERY, TOKEN_USER,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

/// Restricts NTFS file permissions to the current user and disables ACL inheritance.
pub fn restrict_private_key_acl(path: &Path) -> CoreResult<()> {
    #[cfg(windows)]
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(CoreError::Os("OpenProcessToken failed".to_string()));
        }

        let mut return_len: u32 = 0;
        let _ = GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut return_len);
        if return_len == 0 {
            let _ = CloseHandle(token);
            return Err(CoreError::Os("GetTokenInformation size query failed".to_string()));
        }

        let mut token_user_buf = vec![0u8; return_len as usize];
        if GetTokenInformation(
            token,
            TokenUser,
            token_user_buf.as_mut_ptr() as *mut std::ffi::c_void,
            return_len,
            &mut return_len,
        ) == 0
        {
            let _ = CloseHandle(token);
            return Err(CoreError::Os("GetTokenInformation failed".to_string()));
        }

        let token_user = &*(token_user_buf.as_ptr() as *const TOKEN_USER);
        let user_sid = token_user.User.Sid;

        let ea = EXPLICIT_ACCESS_W {
            grfAccessPermissions: GENERIC_READ | GENERIC_WRITE,
            grfAccessMode: SET_ACCESS,
            grfInheritance: NO_INHERITANCE,
            Trustee: TRUSTEE_W {
                pMultipleTrustee: std::ptr::null_mut(),
                MultipleTrusteeOperation: 0,
                TrusteeForm: TRUSTEE_IS_SID,
                TrusteeType: TRUSTEE_IS_USER,
                ptstrName: user_sid as *mut u16,
            },
        };

        let mut new_dacl: *mut ACL = std::ptr::null_mut();
        let acl_status = SetEntriesInAclW(1, &ea, std::ptr::null(), &mut new_dacl);
        if acl_status != ERROR_SUCCESS {
            let _ = CloseHandle(token);
            return Err(CoreError::Os(format!(
                "SetEntriesInAclW failed with code {acl_status}"
            )));
        }

        let mut wide_path: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let sec_status = SetNamedSecurityInfoW(
            wide_path.as_mut_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            new_dacl,
            std::ptr::null(),
        );

        let _ = LocalFree(new_dacl as HLOCAL);
        let _ = CloseHandle(token);

        if sec_status != ERROR_SUCCESS {
            return Err(CoreError::Os(format!(
                "SetNamedSecurityInfoW failed with code {sec_status}"
            )));
        }

        Ok(())
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms)?;
        Ok(())
    }

    #[cfg(all(not(windows), not(unix)))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_restrict_private_key_acl() {
        let dir = tempdir().expect("tempdir");
        let key_file = dir.path().join("test_id_ed25519");
        std::fs::write(&key_file, b"dummy private key").expect("write");
        let res = restrict_private_key_acl(&key_file);
        assert!(res.is_ok());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::metadata(&key_file).expect("metadata");
            assert_eq!(meta.permissions().mode() & 0o777, 0o600);
        }
    }
}
