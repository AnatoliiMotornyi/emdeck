use super::*;
use std::fs;

fn temp_root(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("emdeck-config-{name}"));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn reports_no_configuration_before_anything_is_written() {
    let root = temp_root("absent");
    assert_eq!(read(&root).unwrap(), None);
}

#[test]
fn creates_the_folder_and_seeds_a_self_ignoring_gitignore() {
    let root = temp_root("seed");
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".emdeck/.gitignore")).unwrap(),
        "*\n"
    );
    assert_eq!(read(&root).unwrap().unwrap(), "{\n  \"version\": 1\n}\n");
}

#[test]
fn replaces_an_existing_configuration_without_losing_the_ignore_file() {
    let root = temp_root("replace");
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    write(&root, "{\n  \"version\": 1,\n  \"settings\": {}\n}\n").unwrap();
    assert!(read(&root).unwrap().unwrap().contains("settings"));
    assert!(root.join(".emdeck/.gitignore").exists());
}

#[test]
fn keeps_a_gitignore_the_user_edited() {
    let root = temp_root("custom-ignore");
    fs::create_dir_all(root.join(".emdeck")).unwrap();
    fs::write(root.join(".emdeck/.gitignore"), "# mine\n*\n").unwrap();
    write(&root, "{\n  \"version\": 1\n}\n").unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".emdeck/.gitignore")).unwrap(),
        "# mine\n*\n"
    );
}

#[test]
fn refuses_a_configuration_larger_than_the_limit() {
    let root = temp_root("oversize");
    let huge = "x".repeat((MAX_CONFIG_SIZE + 1) as usize);
    assert!(write(&root, &huge).is_err());
}

#[test]
fn reports_non_utf8_contents_as_an_error_rather_than_panicking() {
    let root = temp_root("binary");
    fs::create_dir_all(root.join(".emdeck")).unwrap();
    fs::write(root.join(".emdeck/settings.json"), [0xff, 0xfe, 0x00]).unwrap();
    assert!(read(&root).is_err());
}
