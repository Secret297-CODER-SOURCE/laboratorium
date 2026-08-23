/** Scoring flags hashed into challenges.flag_hash. Never shown by mock demo pages. */
export const DEFAULT_FLAGS = {
  'nmap-scan': 'lab{nmap_recon}',
  'sql-injection': 'lab{sqli_master}',
  'xss-stored': 'lab{xss_pwned}',
  'buffer-overflow': 'lab{stack_smash}',
  'malware-static': 'lab{ioc_found}',
  'python-port-scanner': 'lab{py_scanner}',
  'ghidra-crackme': 'lab{crackme_key}',
  'priv-esc-linux': 'lab{root_shell}',
};

/** Practice strings revealed by mock demo pages — they do not match scoring hashes. */
export const DEMO_FLAGS = {
  'nmap-scan': 'demo{nmap_practice}',
  'sql-injection': 'demo{sql_injection_practice}',
  'xss-stored': 'demo{xss_practice}',
  'buffer-overflow': 'demo{stack_practice}',
  'malware-static': 'demo{ioc_practice}',
  'python-port-scanner': 'demo{py_scanner_practice}',
  'ghidra-crackme': 'demo{crackme_practice}',
  'priv-esc-linux': 'demo{priv_esc_practice}',
};
