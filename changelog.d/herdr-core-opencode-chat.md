### Fixed
- On the herdr-core runtime, an OpenCode pane's Chat shows its conversation instead of "Conversation
  unavailable": Ovis keeps the session OpenCode last reported for the pane, since OpenCode names a
  session to herdr-core only while it works or waits. A pane whose session has not worked since Ovis
  started shows its terminal until its next prompt.
