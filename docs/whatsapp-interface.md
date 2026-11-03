# WhatsApp desktop interface (26.4.0)

The company console has an Open WhatsApp interface button. It opens a Bright Ai owned window with a local toolbar and an isolated WebContentsView for https://web.whatsapp.com/. This is the actual web interface, separate from the Baileys auto-reply connection. Each needs its own linked-device pairing. No automatic messages are sent by opening the interface.

The persistent session is keyed by server origin, company and signed-in user. Changing company, signing out or navigating away closes the window. The remote page has no Bright preload, Node, or IPC bridge. HTTPS origin navigation is restricted, new windows and downloads are blocked, and camera/microphone permissions are denied. The local toolbar offers return, reload and fixed external-browser fallback. Its IPC accepts only the trusted local top frame. Chromium retains its true version in the user agent.

The UI smoke checks the installed Windows executable, native view creation, isolation and toolbar using a controlled remote-page fixture. A further unauthenticated live check requires the WhatsApp login surface to load without an unsupported-browser message, without capturing a QR. A real phone pairing and customer delivery require the account owner's device; these are not established by the fixture test.
