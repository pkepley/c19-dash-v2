# c19-dash-v2

I'm in the process of migrating my website to a completely static
site. As a result, I will no longer have an R/shiny-server instance to
run my existing [COVID-19 tracking
dashboard](https://github.com/pkepley/c19-dash) - since that would
require a server! The purpose of this repository is to replace that
dashboard's functionality with something that is more amenable to a
static site.

This version will remove dependence on R and shiny-server, and instead
will use Python+Pandas for the local data pull (which I have running
on a Raspberry Pi) and D3 for graphics (for client-side rendering).

