'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('digitalArk', {
  isDesktop: true,
  platform: process.platform
});
