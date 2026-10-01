// AWS group styles, taken from the AWS Architecture Icons deck (slides 9, 14, 25-26):
// 1.25pt border, group icon (32px) at the top-left corner, label to its right.
export const GROUP_KINDS = {
  "aws-cloud":      { label: "AWS Cloud", color: "#232F3E", icon: "AWS-Cloud", dash: "", fillLight: "none", fillDark: "none" },
  "region":         { label: "Region", color: "#00A4A6", icon: "Region", dash: "2 3", fillLight: "none", fillDark: "none" },
  "az":             { label: "Availability Zone", color: "#00A4A6", icon: null, dash: "6 4", fillLight: "none", fillDark: "none" },
  "vpc":            { label: "VPC", color: "#8C4FFF", icon: "Virtual-private-cloud-VPC", dash: "", fillLight: "none", fillDark: "none" },
  "public-subnet":  { label: "Public subnet", color: "#7AA116", icon: "Public-subnet", dash: "", fillLight: "#F2F6E8", fillDark: "#7AA11618" },
  "private-subnet": { label: "Private subnet", color: "#00A4A6", icon: "Private-subnet", dash: "", fillLight: "#E6F6F7", fillDark: "#00A4A618" },
  "security-group": { label: "Security group", color: "#DD344C", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  "asg":            { label: "Auto Scaling group", color: "#ED7100", icon: "Auto-Scaling-group", dash: "6 4", fillLight: "none", fillDark: "none" },
  "account":        { label: "AWS account", color: "#E7157B", icon: "AWS-Account", dash: "", fillLight: "none", fillDark: "none" },
  "corporate-dc":   { label: "Corporate data center", color: "#7D8998", icon: "Corporate-data-center", dash: "", fillLight: "none", fillDark: "none" },
  "server-contents":{ label: "Server contents", color: "#7D8998", icon: "Server-contents", dash: "", fillLight: "none", fillDark: "none" },
  "ec2-contents":   { label: "EC2 instance contents", color: "#ED7100", icon: "EC2-instance-contents", dash: "", fillLight: "none", fillDark: "none" },
  "spot-fleet":     { label: "Spot Fleet", color: "#ED7100", icon: "Spot-Fleet", dash: "", fillLight: "none", fillDark: "none" },
  "generic":        { label: "", color: "#7D8998", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  "generic-dashed": { label: "", color: "#7D8998", icon: null, dash: "6 4", fillLight: "none", fillDark: "none" },
  // stack: invisible container used only for layout (no border, no padding); cannot be an edge endpoint
  "stack":          { label: "", color: "none", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  // custom group: pass `icon` (a service id) -> uses the service's category color and 32px service icon
  "custom":         { label: "", color: "#7D8998", icon: null, dash: "", fillLight: "none", fillDark: "none" },
};

export const PILLARS = ["operational-excellence", "security", "reliability", "performance-efficiency", "cost-optimization", "sustainability"];
