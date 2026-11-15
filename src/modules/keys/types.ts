export interface SshKeyDto {
  id: string;
  name: string;
  key_type: string;
  private_key_path: string;
  public_key_content: string | null;
  fingerprint: string;
  has_passphrase: boolean;
  has_saved_passphrase: boolean;
  is_default: boolean;
  file_exists: boolean;
  created_at: string;
}

export interface GenerateSshKeyRequestDto {
  name: string;
  key_type: "ED25519" | "RSA_4096";
  comment?: string;
  passphrase?: string;
  set_default: boolean;
}

export interface ImportSshKeyRequestDto {
  name: string;
  source_path: string;
  copy_to_managed_dir?: boolean;
  passphrase?: string;
  set_default?: boolean;
}
