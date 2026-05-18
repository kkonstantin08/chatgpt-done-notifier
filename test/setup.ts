// Mock Chrome API for testing
global.chrome = {
  runtime: {
    getURL: (path: string) => `chrome-extension://mock-id/${path}`,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    },
    session: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    reload: vi.fn()
  },
  windows: {
    get: vi.fn(),
    update: vi.fn()
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: {
      addListener: vi.fn()
    }
  },
  offscreen: {
    createDocument: vi.fn()
  }
} as any;
