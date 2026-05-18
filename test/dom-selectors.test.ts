import { describe, it, expect, beforeEach } from 'vitest';
import {
  findStopButton,
  findLatestAssistantTurn,
  fingerprintAssistantTurn,
  detectObviousError,
  inspectChatGptDom
} from '../src/content/dom-selectors';

describe('findStopButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should find stop button by data-testid', () => {
    document.body.innerHTML = `
      <main>
        <form>
          <button data-testid="stop-button">Stop</button>
        </form>
      </main>
    `;

    const result = findStopButton();
    expect(result).not.toBeNull();
    expect(result?.element.textContent).toBe('Stop');
  });

  it('should find stop button by aria-label', () => {
    document.body.innerHTML = `
      <main>
        <form>
          <button aria-label="Stop generating">⏹</button>
        </form>
      </main>
    `;

    const result = findStopButton();
    expect(result).not.toBeNull();
  });

  it('should prioritize buttons with higher scores', () => {
    document.body.innerHTML = `
      <button>Stop</button>
      <main>
        <form>
          <button data-testid="stop-button" aria-label="Stop generating">Stop</button>
        </form>
      </main>
    `;

    const result = findStopButton();
    expect(result?.element.getAttribute('data-testid')).toBe('stop-button');
  });

  it('should return null when no stop button found', () => {
    document.body.innerHTML = '<button>Submit</button>';
    expect(findStopButton()).toBeNull();
  });

  it('should not match buttons with low score', () => {
    document.body.innerHTML = '<button>Stop</button>'; // No form or main context
    expect(findStopButton()).toBeNull();
  });
});

describe('findLatestAssistantTurn', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should find assistant turn by data attribute', () => {
    document.body.innerHTML = `
      <div data-message-author-role="user">User message</div>
      <div data-message-author-role="assistant">
        <p>Assistant response</p>
      </div>
    `;

    const result = findLatestAssistantTurn();
    expect(result).not.toBeNull();
    expect(result?.textContent).toContain('Assistant response');
  });

  it('should return latest assistant turn when multiple exist', () => {
    document.body.innerHTML = `
      <div data-message-author-role="assistant">First response</div>
      <div data-message-author-role="assistant">Second response</div>
      <div data-message-author-role="assistant">Latest response</div>
    `;

    const result = findLatestAssistantTurn();
    expect(result?.textContent).toBe('Latest response');
  });

  it('should use fallback selector for articles in main', () => {
    document.body.innerHTML = `
      <main>
        <article>
          <p>This is an assistant response with content</p>
          <code>some code</code>
        </article>
      </main>
    `;

    const result = findLatestAssistantTurn();
    expect(result).not.toBeNull();
  });

  it('should filter out empty articles', () => {
    document.body.innerHTML = `
      <main>
        <article></article>
        <article>   </article>
        <article><p>Valid content</p></article>
      </main>
    `;

    const result = findLatestAssistantTurn();
    expect(result?.textContent).toContain('Valid content');
  });

  it('should exclude user messages in fallback', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <p>User message</p>
        </article>
        <article>
          <p>Assistant message</p>
        </article>
      </main>
    `;

    const result = findLatestAssistantTurn();
    expect(result?.textContent).toContain('Assistant message');
  });

  it('should exclude navigation elements', () => {
    document.body.innerHTML = `
      <nav>
        <article><p>Navigation item</p></article>
      </nav>
      <main>
        <article><p>Real content</p></article>
      </main>
    `;

    const result = findLatestAssistantTurn();
    expect(result?.textContent).toContain('Real content');
  });

  it('should return null when no assistant turn found', () => {
    document.body.innerHTML = '<div>No assistant messages</div>';
    expect(findLatestAssistantTurn()).toBeNull();
  });
});

describe('fingerprintAssistantTurn', () => {
  it('should return null for null element', () => {
    expect(fingerprintAssistantTurn(null)).toBeNull();
  });

  it('should return null for empty element', () => {
    const div = document.createElement('div');
    expect(fingerprintAssistantTurn(div)).toBeNull();
  });

  it('should generate fingerprint with text hash and metadata', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Test content</p><code>code block</code>';

    const fingerprint = fingerprintAssistantTurn(div);
    expect(fingerprint).not.toBeNull();
    expect(fingerprint).toMatch(/^[0-9a-f]{8}:\d+:\d+:\d+:\d+:\d+$/);
  });

  it('should use both first and last parts for long text', () => {
    const div = document.createElement('div');
    const longText = 'A'.repeat(5000);
    div.textContent = longText;

    const fingerprint = fingerprintAssistantTurn(div);
    expect(fingerprint).not.toBeNull();

    // Should include length
    expect(fingerprint).toContain(':5000:');
  });

  it('should generate different fingerprints for different content', () => {
    const div1 = document.createElement('div');
    div1.textContent = 'Content A';

    const div2 = document.createElement('div');
    div2.textContent = 'Content B';

    const fp1 = fingerprintAssistantTurn(div1);
    const fp2 = fingerprintAssistantTurn(div2);

    expect(fp1).not.toBe(fp2);
  });

  it('should count code blocks, tables, and images', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <p>Text</p>
      <pre>code1</pre>
      <code>code2</code>
      <table><tr><td>table</td></tr></table>
      <img src="test.png" />
    `;

    const fingerprint = fingerprintAssistantTurn(div);
    expect(fingerprint).toMatch(/:\d+:2:1:1:\d+$/); // 2 code blocks, 1 table, 1 image
  });
});

describe('detectObviousError', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should detect error by role=alert', () => {
    document.body.innerHTML = `
      <div role="alert">Something went wrong</div>
    `;

    expect(detectObviousError()).toBe(true);
  });

  it('should detect error by data-testid', () => {
    document.body.innerHTML = `
      <div data-testid="error-message">Network error</div>
    `;

    expect(detectObviousError()).toBe(true);
  });

  it('should detect error by CSS class', () => {
    document.body.innerHTML = `
      <div class="text-red-500">An error occurred</div>
    `;

    expect(detectObviousError()).toBe(true);
  });

  it('should detect error by text content', () => {
    document.body.innerHTML = `
      <div>There was an error generating a response</div>
    `;

    expect(detectObviousError()).toBe(true);
  });

  it('should return false when no error present', () => {
    document.body.innerHTML = `
      <div>Normal content</div>
    `;

    expect(detectObviousError()).toBe(false);
  });
});

describe('inspectChatGptDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return complete snapshot', () => {
    document.body.innerHTML = `
      <main>
        <form>
          <button data-testid="stop-button">Stop</button>
        </form>
        <div data-message-author-role="assistant">
          <p>Response text</p>
        </div>
      </main>
    `;

    const snapshot = inspectChatGptDom();

    expect(snapshot.observedAt).toBeGreaterThan(0);
    expect(snapshot.stopButtonPresent).toBe(true);
    expect(snapshot.stopButtonSignature).not.toBeNull();
    expect(snapshot.assistantFingerprint).not.toBeNull();
    expect(snapshot.assistantTurnPresent).toBe(true);
    expect(snapshot.errorPresent).toBe(false);
  });

  it('should detect when stop button is absent', () => {
    document.body.innerHTML = '<div>No stop button</div>';

    const snapshot = inspectChatGptDom();
    expect(snapshot.stopButtonPresent).toBe(false);
    expect(snapshot.stopButtonSignature).toBeNull();
  });

  it('should detect errors', () => {
    document.body.innerHTML = `
      <div role="alert">Something went wrong</div>
    `;

    const snapshot = inspectChatGptDom();
    expect(snapshot.errorPresent).toBe(true);
  });
});
