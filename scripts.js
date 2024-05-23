// JavaScript:
const agentInitScript = document.createElement("script");
agentInitScript.type = "module";
agentInitScript.innerHTML = `
import Agent from 'https://cdn.jsdelivr.net/npm/@agent-embed/js@0.0.1/dist/web.js'
Agent.initStandard({
  agentName: "SommelierGuaja AI",
  apiHost: "https://app.predictabledialogs.com/web/incoming",
});
`;
document.body.append(agentInitScript);
