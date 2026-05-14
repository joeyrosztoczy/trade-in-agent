window.TradeReviewDemoData = {
  user: {
    name: "Joey Yoder",
    initials: "JY",
    period: "FY26 Q2"
  },
  summary: {
    lastSync: "14 May - 09:42",
    locationsOnline: "7 / 7",
    slaBreaches: "2",
    kpis: [
      { label: "Open Reviews", value: "47", delta: "6 new wk/wk", tone: "watch" },
      { label: "Avg Days to Close", value: "4.2", suffix: "d", delta: "0.8 faster", tone: "good" },
      { label: "Pipeline Value", value: "$3.41", suffix: "M", delta: "12.4% higher", tone: "good" },
      { label: "Avg Risk Score", value: "3.2", suffix: "/5", delta: "0.3 higher", tone: "watch" }
    ]
  },
  cases: [
    {
      id: "TIA-24881",
      caseNumber: "TR-24881",
      unit: "9R 540",
      modelYear: 2021,
      type: "High horsepower tractor",
      serial: "1RW9R540EMP012847",
      hours: "2,140",
      customer: "Linwood Farms LLC",
      location: "Mt Forest, ON",
      stage: "Valuation",
      route: "Technician escalation",
      age: "5d",
      risk: "high",
      riskScore: 86,
      reviewStatus: "Needs used-team decision",
      confidence: "Medium",
      proposedTrade: 342500,
      lowValue: 312000,
      highValue: 378000,
      reconBudget: 42500,
      specs: [
        ["Engine", "13.6L / 540 hp"],
        ["Transmission", "e23 PowerShift"],
        ["Tires F/R", "75% / 60%"],
        ["Hitch", "Cat IV/IVN"]
      ],
      riskFactors: [
        ["Hour drift", 86, "high"],
        ["Market velocity", 58, "medium"],
        ["Recon spend", 61, "medium"],
        ["Customer equity", 22, "low"]
      ],
      evidence: [
        { label: "Front 45", status: "accepted", meta: "Photo accepted" },
        { label: "Rear hitch", status: "accepted", meta: "Photo accepted" },
        { label: "Startup video", status: "retake", meta: "Audio weak" },
        { label: "Final drives", status: "missing", meta: "Needed" }
      ],
      reviewLines: [
        { label: "Field evidence", value: "10 accepted / 2 retakes", tone: "watch" },
        { label: "Recon posture", value: "$38k-$48k likely", tone: "risk" },
        { label: "Market posture", value: "Hold value until mechanic review", tone: "risk" },
        { label: "Next decision", value: "Escalate final drives", tone: "risk" }
      ],
      summary: "Photos are strong enough for visible condition review, but startup audio and final drive evidence are not strong enough for a confident allowance. The recommended reviewer move is to hold value posture and request a licensed technician inspection on final drives before approval."
    },
    {
      id: "TIA-24879",
      caseNumber: "TR-24879",
      unit: "S780",
      modelYear: 2019,
      type: "Combine",
      serial: "1H0S780SHKS812334",
      hours: "1,720",
      customer: "Beuermann & Sons",
      location: "Listowel, ON",
      stage: "Inspection",
      route: "Standard review",
      age: "3d",
      risk: "medium",
      riskScore: 58,
      reviewStatus: "Waiting on crop handling evidence",
      confidence: "Medium",
      proposedTrade: 218750,
      lowValue: 198000,
      highValue: 246000,
      reconBudget: 27500,
      specs: [
        ["Separator hours", "1,192"],
        ["Header", "Not included"],
        ["Tires F/R", "65% / 55%"],
        ["Chopper", "Premium residue"]
      ],
      riskFactors: [
        ["Feederhouse", 65, "medium"],
        ["Rotor wear", 54, "medium"],
        ["Market velocity", 48, "low"],
        ["Evidence gap", 72, "high"]
      ],
      evidence: [
        { label: "Walk around", status: "accepted", meta: "Video accepted" },
        { label: "Engine bay", status: "accepted", meta: "Photo accepted" },
        { label: "Feederhouse", status: "retake", meta: "Too close" },
        { label: "Grain tank", status: "missing", meta: "Needed" }
      ],
      reviewLines: [
        { label: "Field evidence", value: "8 accepted / 1 retake", tone: "watch" },
        { label: "Recon posture", value: "$23k-$32k likely", tone: "watch" },
        { label: "Market posture", value: "Comparable demand stable", tone: "good" },
        { label: "Next decision", value: "Request crop handling photos", tone: "watch" }
      ],
      summary: "The combine appears broadly marketable, but the review packet lacks enough crop handling evidence for a confident reconditioning budget. The right next step is a targeted retake of feederhouse wear plus grain tank and unloading auger photos."
    },
    {
      id: "TIA-24877",
      caseNumber: "TR-24877",
      unit: "8R 310",
      modelYear: 2020,
      type: "Row crop tractor",
      serial: "1RW8R310PNL003319",
      hours: "1,080",
      customer: "Highwood Acres",
      location: "Embro, ON",
      stage: "Recon Budget",
      route: "Fast path candidate",
      age: "2d",
      risk: "low",
      riskScore: 31,
      reviewStatus: "Ready for reviewer approval",
      confidence: "High",
      proposedTrade: 287200,
      lowValue: 272000,
      highValue: 304000,
      reconBudget: 14500,
      specs: [
        ["Engine", "9.0L / 310 hp"],
        ["Transmission", "IVT"],
        ["Tires F/R", "80% / 78%"],
        ["Guidance", "StarFire 6000"]
      ],
      riskFactors: [
        ["Hours", 26, "low"],
        ["Cosmetic wear", 34, "low"],
        ["Recon spend", 28, "low"],
        ["Evidence quality", 18, "low"]
      ],
      evidence: [
        { label: "Front 45", status: "accepted", meta: "Photo accepted" },
        { label: "Cab controls", status: "accepted", meta: "Photo accepted" },
        { label: "Startup video", status: "accepted", meta: "Video accepted" },
        { label: "Tires", status: "accepted", meta: "Photo accepted" }
      ],
      reviewLines: [
        { label: "Field evidence", value: "12 accepted / 0 retakes", tone: "good" },
        { label: "Recon posture", value: "$12k-$17k likely", tone: "good" },
        { label: "Market posture", value: "Retail-ready after normal recon", tone: "good" },
        { label: "Next decision", value: "Approve allowance", tone: "good" }
      ],
      summary: "Evidence coverage is strong and the visible condition signals are consistent with a normal reconditioning path. This is a good fast-path approval candidate unless business-system history exposes a hidden service issue."
    },
    {
      id: "TIA-24874",
      caseNumber: "TR-24874",
      unit: "6155M",
      modelYear: 2018,
      type: "Utility tractor",
      serial: "1L06155MTKK814902",
      hours: "3,940",
      customer: "VanderMeer Dairy",
      location: "Tavistock, ON",
      stage: "Customer Quote",
      route: "Standard review",
      age: "2d",
      risk: "medium",
      riskScore: 64,
      reviewStatus: "Needs recon budget adjustment",
      confidence: "Low",
      proposedTrade: 89400,
      lowValue: 76000,
      highValue: 98000,
      reconBudget: 18500,
      specs: [
        ["Loader", "H310 included"],
        ["Transmission", "AutoQuad"],
        ["Tires F/R", "45% / 40%"],
        ["Hydraulics", "3 rear SCV"]
      ],
      riskFactors: [
        ["Dairy corrosion", 72, "high"],
        ["Tire spend", 66, "medium"],
        ["Hours", 62, "medium"],
        ["Evidence quality", 45, "low"]
      ],
      evidence: [
        { label: "Loader pins", status: "accepted", meta: "Photo accepted" },
        { label: "Cab floor", status: "retake", meta: "Glare" },
        { label: "Hydraulics", status: "accepted", meta: "Photo accepted" },
        { label: "Undercarriage", status: "missing", meta: "Needed" }
      ],
      reviewLines: [
        { label: "Field evidence", value: "7 accepted / 2 retakes", tone: "watch" },
        { label: "Recon posture", value: "$16k-$23k likely", tone: "watch" },
        { label: "Market posture", value: "Quote should include corrosion holdback", tone: "risk" },
        { label: "Next decision", value: "Request underside photos", tone: "watch" }
      ],
      summary: "This unit may be a reasonable trade, but dairy-environment corrosion creates budget risk. The reviewer should keep the allowance conservative until underside and cab-floor evidence are clean enough."
    }
  ]
};

