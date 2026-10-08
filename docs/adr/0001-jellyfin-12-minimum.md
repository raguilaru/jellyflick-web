# Support Jellyfin server 12.0 and later only

The client talks only to Jellyfin 12.0 or later, which turned off the legacy authentication methods, removed old route prefixes, and is the version the official SDK 1.0 targets. Supporting 10.x servers would mean keeping deprecated endpoints and the legacy authentication methods alongside the current ones. That cuts against the project's goals of being as light and simple as possible and avoiding legacy APIs. The primary user's server already runs 12.x, so losing older servers is an acceptable trade.
