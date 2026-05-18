const fs = require('fs');
const { execSync } = require('child_process');

const root = require('path').join(__dirname, '..');
const js = execSync('git show origin/shannon:content.js', { cwd: root, encoding: 'utf8' });
const css = execSync('git show origin/shannon:sidebar.css', { cwd: root, encoding: 'utf8' });

let out = js;
out = out.replace(
  '<motion id="gp-panel" class="mytasks-sidebar"',
  '<motion id="gp-tasks-panel" class="mytasks-sidebar"',
);
out = out.replace(
  '<div id="gp-panel" class="mytasks-sidebar"',
  '<div id="gp-tasks-panel" class="mytasks-sidebar"',
);
out = out.split("getElementById('gp-panel')").join("getElementById('gp-tasks-panel')");
out = out.split('getElementById("gp-panel")').join('getElementById("gp-tasks-panel")');
out = out.split("querySelector('#gp-panel").join("querySelector('#gp-tasks-panel");
out = out.split('querySelector("#gp-panel').join('querySelector("#gp-tasks-panel');
out = out.split("querySelectorAll('#gp-panel").join("querySelectorAll('#gp-tasks-panel");
out = out.split("closest('#gp-panel')").join("closest('#gp-tasks-panel')");
out = out.split('#gp-panel .gp-').join('#gp-tasks-panel .gp-');
out = out.split("if (el.closest('#gp-panel'))").join("if (el.closest('#gp-tasks-panel'))");
out = out.split("host.closest('#gp-panel,").join("host.closest('#gp-tasks-panel, #gp-panel,");
out = out.split("el.closest('#gp-panel, .mytasks-sidebar')").join(
  "el.closest('#gp-tasks-panel, #gp-panel, .mytasks-sidebar')",
);
out = out.split(
  "el.closest('#gp-panel, .mytasks-sidebar, #gp-sidebar-btn",
).join("el.closest('#gp-tasks-panel, #gp-panel, .mytasks-sidebar, #gp-sidebar-btn");
out = out.split(
  "el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-panel,",
).join(
  "el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-tasks-panel, #gp-panel,",
);
out = out.split(
  "!el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-panel')",
).join("!el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-tasks-panel, #gp-panel')");
out = out.split("setProperty('--gp-panel-").join("setProperty('--gp-tasks-panel-");
out = out.split('var(--gp-panel-').join('var(--gp-tasks-panel-');
out = out.split("toggle('gp-sidebar-open'").join("toggle('gp-tasks-sidebar-open'");
out = out.split("contains('gp-sidebar-open'").join("contains('gp-tasks-sidebar-open'");
out = out.split("add('gp-sidebar-open'").join("add('gp-tasks-sidebar-open'");
out = out.split("remove('gp-sidebar-open'").join("remove('gp-tasks-sidebar-open'");

let cssOut = css.split('#gp-panel.mytasks-sidebar').join('#gp-tasks-panel.mytasks-sidebar');
cssOut = cssOut.split('--gp-panel-width').join('--gp-tasks-panel-width');
cssOut = cssOut.split('--gp-panel-calendar-gap').join('--gp-tasks-panel-calendar-gap');
cssOut = cssOut.split('--gp-panel-top').join('--gp-tasks-panel-top');
cssOut = cssOut.split('--gp-panel-right').join('--gp-tasks-panel-right');
cssOut = cssOut.split('--gp-panel-rail-inset').join('--gp-tasks-panel-rail-inset');
cssOut = cssOut.split('--gp-panel-rail-gap').join('--gp-tasks-panel-rail-gap');
cssOut = cssOut.split('--gp-panel-height').join('--gp-tasks-panel-height');

fs.writeFileSync(require('path').join(root, 'taskSidebar.js'), out);
fs.writeFileSync(require('path').join(root, 'sidebar.css'), cssOut);
console.log('Wrote taskSidebar.js (%d lines) and sidebar.css', out.split('\n').length);
