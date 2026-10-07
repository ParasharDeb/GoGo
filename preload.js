const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  dispatch: (type, payload) => ipcRenderer.invoke('dispatch', type, payload),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onWalk: (cb) => ipcRenderer.on('walk', (_e, w) => cb(w)),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_e, r) => cb(r)),
  toggleWidget: () => ipcRenderer.send('widget:toggle'),
  widget: {
    ignore: (v) => ipcRenderer.send('widget:ignore', v),
    dragStart: () => ipcRenderer.send('widget:drag-start'),
    drag: (dx, dy) => ipcRenderer.send('widget:drag', dx, dy),
    dragEnd: () => ipcRenderer.send('widget:drag-end'),
    click: () => ipcRenderer.send('widget:click'),
    menu: () => ipcRenderer.send('widget:menu'),
  },
});
