"use client";

import { useState } from "react";
import {
  AppIcon,
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Mark,
  NavItem,
  OverlayPill,
  Select,
  Skeleton,
  Tabs,
  TextArea,
  TextInput,
  ToastRegion,
  Toggle,
  Waveform,
  Wordmark,
} from "@take-my-word/brand";

export function Gallery() {
  const [toggle, setToggle] = useState(true);
  const [tab, setTab] = useState("plain");
  const [dialog, setDialog] = useState(false);
  const [toasts, setToasts] = useState([
    { id: "saved", tone: "success" as const, message: "Style saved." },
    { id: "failed", tone: "error" as const, message: "We could not delete the dictation." },
  ]);

  return (
    <div className="gallery-grid">
      <section className="gallery-section" aria-labelledby="g-identity">
        <h2 id="g-identity">Identity</h2>
        <div className="gallery-row">
          <Wordmark height={48} />
          <Wordmark height={24} />
        </div>
        <div className="gallery-row gallery-icons" data-testid="gallery-icons">
          {[16, 24, 32, 48, 64, 128].map((size) => (
            <AppIcon key={size} size={size} />
          ))}
          {[16, 24, 32, 64].map((size) => (
            <Mark key={size} size={size} className="gallery-mark" />
          ))}
        </div>
      </section>

      <section className="gallery-section" aria-labelledby="g-buttons">
        <h2 id="g-buttons">Buttons</h2>
        <div className="gallery-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="gallery-row">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="gallery-section" aria-labelledby="g-fields">
        <h2 id="g-fields">Fields</h2>
        <div className="gallery-fields">
          <TextInput label="Username" defaultValue="raul.hernandez" />
          <TextInput label="Password" type="password" hint="At least 12 characters." />
          <TextInput label="Term" defaultValue="Kubernetis" error="This term already exists." />
          <Select label="Default style" defaultValue="casual">
            <option value="plain">Plain</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
          </Select>
          <TextArea label="Prompt" defaultValue="Short sentences, no greetings." />
          <div className="gallery-stack">
            <Checkbox label="Remember me on this browser" defaultChecked />
            <Checkbox label="Paste with Ctrl + Shift + V" />
            <Toggle label="Start with Windows" checked={toggle} onChange={setToggle} />
          </div>
        </div>
      </section>

      <section className="gallery-section" aria-labelledby="g-navigation">
        <h2 id="g-navigation">Navigation</h2>
        <Tabs
          label="Styles"
          selected={tab}
          onSelect={setTab}
          tabs={[
            { id: "plain", label: "Plain", panel: "Drops fillers and punctuates." },
            { id: "casual", label: "Casual", panel: "Friendly and direct." },
            { id: "formal", label: "Formal", panel: "Careful and professional." },
          ]}
        />
        <nav className="gallery-row" aria-label="Sections">
          <NavItem href="#account" current>
            Account
          </NavItem>
          <NavItem href="#history" current={false}>
            History
          </NavItem>
        </nav>
      </section>

      <section className="gallery-section" aria-labelledby="g-feedback">
        <h2 id="g-feedback">Feedback</h2>
        <div className="gallery-row">
          <Badge>Built-in</Badge>
          <Badge tone="accent">Default</Badge>
          <Badge tone="success">Saved</Badge>
          <Badge tone="warning">Slow</Badge>
          <Badge tone="error">Failed</Badge>
          <Badge tone="info">New</Badge>
        </div>
        <div className="gallery-row gallery-overlay">
          <OverlayPill state="listening" label="Listening" />
          <OverlayPill state="listening" level={0.5} label="Listening" />
          <OverlayPill state="processing" label="Cleaning up" />
          <OverlayPill state="done" label="Pasted" />
          <OverlayPill state="error" label="No microphone" />
        </div>
        <div className="gallery-row gallery-wave">
          <Waveform demo bars={5} />
          <Waveform level={0.6} bars={9} />
        </div>
        <EmptyState
          title="No terms yet"
          body="Add them from the desktop app."
          icon={<Waveform level={0.2} />}
        />
        <Skeleton lines={3} />
        <div className="gallery-row">
          <Button
            variant="secondary"
            onClick={() => {
              setDialog(true);
            }}
          >
            Open dialog
          </Button>
        </div>
        <Dialog
          open={dialog}
          onClose={() => {
            setDialog(false);
          }}
          title="Delete this dictation?"
          description="This cannot be undone."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDialog(false);
                }}
              >
                Yes, delete
              </Button>
            </>
          }
        />
      </section>
      <ToastRegion
        toasts={toasts}
        label="Notifications"
        dismissLabel="Dismiss"
        onDismiss={(id) => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }}
      />
    </div>
  );
}
