/**
 * Copy My Tasks / kanban from origin/shannon into together's split files.
 * Renames IDs so goal planner (#gp-panel, #gp-sidebar-btn) does not collide.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const root = require('path').join(__dirname, '..');
const js = execSync('git show origin/shannon:content.js', { cwd: root, encoding: 'utf8' });
const css = execSync('git show origin/shannon:sidebar.css', { cwd: root, encoding: 'utf8' });

let out = js;

// Tasks sliding panel (goals keep #gp-panel)
out = out.replace(
  '<div id="gp-panel" class="mytasks-sidebar"',
  '<div id="gp-kanban-panel" class="mytasks-sidebar"',
);
out = out.split("getElementById('gp-panel')").join("getElementById('gp-kanban-panel')");
out = out.split('getElementById("gp-panel")').join('getElementById("gp-kanban-panel")');
out = out.split("querySelector('#gp-panel").join("querySelector('#gp-kanban-panel");
out = out.split('querySelector("#gp-panel').join('querySelector("#gp-kanban-panel');
out = out.split("querySelectorAll('#gp-panel").join("querySelectorAll('#gp-kanban-panel");
out = out.split("closest('#gp-panel')").join("closest('#gp-kanban-panel')");
out = out.split('#gp-panel .gp-').join('#gp-kanban-panel .gp-');
out = out.split("if (el.closest('#gp-panel'))").join("if (el.closest('#gp-kanban-panel'))");
out = out.split("host.closest('#gp-panel,").join("host.closest('#gp-kanban-panel, #gp-panel,");
out = out.split("el.closest('#gp-panel, .mytasks-sidebar')").join(
  "el.closest('#gp-kanban-panel, #gp-panel, .mytasks-sidebar')",
);
out = out.split(
  "el.closest('#gp-panel, .mytasks-sidebar, #gp-sidebar-btn",
).join("el.closest('#gp-kanban-panel, #gp-panel, .mytasks-sidebar, #gp-sidebar-btn");
out = out.split(
  "el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-panel,",
).join(
  "el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-kanban-panel, #gp-panel,",
);
out = out.split(
  "!el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-panel')",
).join("!el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-kanban-panel, #gp-panel')");
out = out.split("setProperty('--gp-panel-").join("setProperty('--gp-kanban-panel-");
out = out.split('var(--gp-panel-').join('var(--gp-kanban-panel-');

// Tasks rail button (goals keep #gp-sidebar-btn on content.js)
out = out.split('gp-sidebar-btn-shell').join('gp-kanban-sidebar-btn-shell');
out = out.split('gp-sidebar-btn__').join('gp-kanban-sidebar-btn__');
out = out.split("getElementById('gp-sidebar-btn')").join("getElementById('gp-kanban-sidebar-btn')");
out = out.split("id = 'gp-sidebar-btn'").join("id = 'gp-kanban-sidebar-btn'");
out = out.split('id = "gp-sidebar-btn"').join('id = "gp-kanban-sidebar-btn"');
out = out.split('#gp-sidebar-btn').join('#gp-kanban-sidebar-btn');
out = out.split('#gp-sidebar-rail').join('#gp-kanban-sidebar-rail');
out = out.split("el?.closest('#gp-panel,").join("el?.closest('#gp-kanban-panel, #gp-panel,");

// Body class when tasks panel open (do not use gp-tasks-sidebar-open — matches sidebar.css)
// gp-sidebar-open stays as shannon wrote it

let cssOut = css.split('#gp-panel.mytasks-sidebar').join('#gp-kanban-panel.mytasks-sidebar');
cssOut = cssOut.split('--gp-panel-width').join('--gp-kanban-panel-width');
cssOut = cssOut.split('--gp-panel-calendar-gap').join('--gp-kanban-panel-calendar-gap');
cssOut = cssOut.split('--gp-panel-top').join('--gp-kanban-panel-top');
cssOut = cssOut.split('--gp-panel-right').join('--gp-kanban-panel-right');
cssOut = cssOut.split('--gp-panel-rail-inset').join('--gp-kanban-panel-rail-inset');
cssOut = cssOut.split('--gp-panel-rail-gap').join('--gp-kanban-panel-rail-gap');
cssOut = cssOut.split('--gp-panel-height').join('--gp-kanban-panel-height');
cssOut = cssOut.split('#gp-sidebar-btn').join('#gp-kanban-sidebar-btn');
cssOut = cssOut.split('.gp-sidebar-btn-shell').join('.gp-kanban-sidebar-btn-shell');
cssOut = cssOut.split('.gp-sidebar-btn__').join('.gp-kanban-sidebar-btn__');
cssOut = cssOut.split('#gp-sidebar-rail').join('#gp-kanban-sidebar-rail');

if (!cssOut.includes('gp-dual-panels-goals-open')) {
  cssOut += `

/* When both panels are open, kanban sits left of the goal panel (offset set in JS). */
body.gp-dual-panels-goals-open #gp-kanban-panel.mytasks-sidebar.open {
  right: calc(var(--gp-kanban-panel-right, 56px) + var(--gp-dual-goal-offset, 0px));
}
`;
}

fs.writeFileSync(require('path').join(root, 'kanbanSidebar.js'), out);
fs.writeFileSync(require('path').join(root, 'sidebar.css'), cssOut);
console.log('Synced kanbanSidebar.js (%d lines) and sidebar.css from shannon', out.split('\n').length);
console.log(
  'Re-apply together dual-panel hooks in kanbanSidebar.js if needed (goal offset, gp:sync-calendar-push, demo kanban seed).',
);
