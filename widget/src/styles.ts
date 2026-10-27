export const styles = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }
.launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer;
  background: #2563eb; color: #fff; font-size: 20px;
  box-shadow: 0 4px 14px rgba(0,0,0,.2);
}
.panel {
  position: fixed; right: 20px; bottom: 80px; z-index: 2147483000;
  width: 340px; max-width: calc(100vw - 40px); padding: 16px;
  background: #fff; color: #18181b; border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.2); font-size: 14px;
}
.panel header { display: flex; justify-content: space-between; align-items: center; }
.close { border: 0; background: none; font-size: 20px; cursor: pointer; color: inherit; }
.muted { color: #71717a; font-size: 12px; }
`;
