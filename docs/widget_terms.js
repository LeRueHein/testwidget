// js/widget_module_requirements_oslc_full_debug.js
// -------------------------------------------------------------
// Récupère tous les Requirements d’un module donné via OSLC Query 2.0
// Avec authentification Basic et debug ServiceProvider URL
// -------------------------------------------------------------

$(document).ready(() => {
  const host         = "https://elm.env02.test.ablogix.biz";
  const projectUUID  = "_DnzyIOn6Ee-ziIFHlD9fOw";
  const changesetURI = `${host}/rm/cm/changeset/_xp-AUO3aEe-Dvbq-QbwzWg`;
  const username     = "ELM_DEV";
  const password     = "ejezYmCuCAVvMrQyHDLx3XJJ4UkkTkreS35xEvezhP5HeAXAP3ii5RgASmtKvrus";
  const authHeader   = 'Basic ' + btoa(`${username}:${password}`);
  const $out         = $("#result");
  const log          = (...a) => { console.log(...a); $out.append(a.join(" ") + "\n"); };
  const parseXML     = txt => new DOMParser().parseFromString(txt, "application/xml");

  // Fetch wrapper
  async function oslcFetch(url) {
    return fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type":       "application/rdf+xml",
        "Accept":             "application/rdf+xml",
        "OSLC-Core-Version":  "2.0",
        "Authorization":      authHeader
      }
    });
  }

  async function fetchModuleURI() {
    return new Promise((res, rej) => {
      RM.Client.getCurrentArtifact(r => {
        if (r.code === RM.OperationResult.OPERATION_OK &&
            r.data.values[RM.Data.Attributes.FORMAT] === RM.Data.Formats.MODULE) {
          res(r.data.ref);
        } else {
          rej("Pas de module ouvert");
        }
      });
    });
  }

  async function fetchCatalogURL() {
    const resp = await oslcFetch(`${host}/rm/rootservices`);
    if (!resp.ok) throw new Error(`rootservices HTTP ${resp.status}`);
    const xml = parseXML(await resp.text());
    const elem = xml.getElementsByTagNameNS("http://open-services.net/xmlns/rm/1.0/","rmServiceProviders")[0];
    if (!elem) throw new Error("Pas de rmServiceProviders dans rootservices");
    return elem.getAttribute("rdf:resource");
  }

  async function fetchServiceProviderURL(catalogURL) {
    const resp = await oslcFetch(catalogURL);
    if (!resp.ok) throw new Error(`catalog HTTP ${resp.status}`);
    const text = await resp.text();
    console.log("[DEBUG] ServiceProvider catalog XML:
", text);
    const xml = parseXML(text);
    const sps = Array.from(xml.getElementsByTagNameNS(
      "http://open-services.net/ns/core#", "ServiceProvider"
    ));
    console.log("[DEBUG] Found ServiceProvider count:", sps.length);
    sps.forEach((sp, idx) =>
      console.log(`[DEBUG] SP[${idx}] about= ${sp.getAttribute("rdf:about")}`,
                  `title= ${sp.getElementsByTagNameNS("http://purl.org/dc/terms/","title")[0]?.textContent}`)
    );
    // select the serviceProvider that matches current projectUUID path
    const match = sps.find(sp => {
      const about = sp.getAttribute("rdf:about");
      return about && about.includes(`/rm/oslc_rm/${projectUUID}/services.xml`);
    });
    if (!match) throw new Error("Pas de ServiceProvider pour ce projet");
    return match.getAttribute("rdf:about");
  }

  async function fetchQueryBaseURI(servicesURL) {
    const resp = await oslcFetch(servicesURL);
    if (!resp.ok) throw new Error(`services.xml HTTP ${resp.status}`);
    const xml  = parseXML(await resp.text());
    const caps = Array.from(xml.getElementsByTagNameNS(
      "http://open-services.net/ns/core#", "QueryCapability"
    ));
    for (let cap of caps) {
      const types = Array.from(cap.getElementsByTagNameNS(
        "http://open-services.net/ns/core#", "resourceType"
      ));
      if (types.some(t =>
        t.getAttribute("rdf:resource") === "http://open-services.net/ns/rm#Requirement"
      )) {
        return cap.getElementsByTagNameNS(
          "http://open-services.net/ns/core#", "queryBase"
        )[0].getAttribute("rdf:resource");
      }
    }
    throw new Error("Pas de QueryCapability Requirement");
  }

  async function fetchModuleRequirements(queryBase, moduleURI) {
    const params = new URLSearchParams({
      "oslc.where":  `nav:parent=<${moduleURI}> AND rdf:type=<http://open-services.net/ns/rm#Requirement>`,
      "oslc.select": "dcterms:identifier,dcterms:title,rm:primaryText",
      "oslc.prefix": "nav=http://com.ibm.rdm/navigation#," +
                      "dcterms=http://purl.org/dc/terms/," +
                      "rdf=http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "oslc.paging":  "true",
      "oslc.pageSize":"200"
    });
    // si queryBase contient déjà '?', on ajoute '&', sinon '?'
    const separator = queryBase.includes('?') ? '&' : '?';
    const url = `${queryBase}${separator}${params}`;
    console.log('[DEBUG] Query URL:', url);
    const resp = await oslcFetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`ModuleQuery HTTP ${resp.status}: ${txt}`);
    }
    return parseXML(await resp.text());
  }    return parseXML(await resp.text());
  }

  function displayRequirements(xml) {
    const members = Array.from(xml.getElementsByTagNameNS(
      "http://open-services.net/ns/core#", "member"
    ));
    log(`📘 ${members.length} Requirement(s) trouvés :`);
    members.forEach((m, i) => {
      const desc = Array.from(m.childNodes).find(n => n.nodeType === 1);
      const id    = desc.getElementsByTagNameNS(
        "http://purl.org/dc/terms/", "identifier"
      )[0]?.textContent || "?";
      const title = desc.getElementsByTagNameNS(
        "http://purl.org/dc/terms/", "title"
      )[0]?.textContent || "(no title)";
      log(` ${i+1}. [${id}] ${title}`);
    });
  }

  $("#goBtn").on("click", async () => {
    $out.text("Chargement…");
    try {
      const moduleURI          = await fetchModuleURI();
      const catalogURL         = await fetchCatalogURL();
      const serviceProviderURL = await fetchServiceProviderURL(catalogURL);
      const queryBase          = await fetchQueryBaseURI(serviceProviderURL);
      const xml                = await fetchModuleRequirements(queryBase, moduleURI);
      displayRequirements(xml);
    } catch (e) {
      $out.text("❌ " + e.message);
    }
  });
});

