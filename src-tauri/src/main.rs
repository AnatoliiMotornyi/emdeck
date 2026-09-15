// The desktop app must not own a console window, including in local debug builds.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
fn main() {
    emdeck_lib::run()
}
