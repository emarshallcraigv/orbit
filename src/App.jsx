import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getValue, setValue } from "./storage.js";

/* ============================== BRAND ============================== */
const LOGO_SRC = "/logo.jpg";

/* ============================== SEED DATA ============================== */
const SEED_ITEMS = [{"id":"SUP-0001","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Clear","name":"Color Ties - Clear","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0002","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"White","name":"Color Ties - White","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0003","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Black","name":"Color Ties - Black","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0004","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Silver","name":"Color Ties - Silver","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0005","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Gold","name":"Color Ties - Gold","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0006","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Blue","name":"Color Ties - Blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0007","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Light Blue","name":"Color Ties - Light Blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0008","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Navy","name":"Color Ties - Navy","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0009","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Pink","name":"Color Ties - Pink","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0010","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Bubblegum","name":"Color Ties - Bubblegum","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0011","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Aqua","name":"Color Ties - Aqua","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0012","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Teal","name":"Color Ties - Teal","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0013","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Red","name":"Color Ties - Red","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0014","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Maroon","name":"Color Ties - Maroon","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0015","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Purple","name":"Color Ties - Purple","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0016","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Dark Purple","name":"Color Ties - Dark Purple","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0017","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Lilac","name":"Color Ties - Lilac","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0018","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Green","name":"Color Ties - Green","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0019","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Light Green","name":"Color Ties - Light Green","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0020","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Pearl","name":"Color Ties - Pearl","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0021","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Orange","name":"Color Ties - Orange","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0022","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Color Ties","desc":"Yellow","name":"Color Ties - Yellow","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0023","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Blue","name":"A-Chain - Blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0024","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Purple","name":"A-Chain - Purple","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0025","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Light Blue","name":"A-Chain - Light Blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0026","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Pink","name":"A-Chain - Pink","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0027","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Black","name":"A-Chain - Black","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0028","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Clear","name":"A-Chain - Clear","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0029","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"White","name":"A-Chain - White","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0030","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Aqua","name":"A-Chain - Aqua","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0031","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Red","name":"A-Chain - Red","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0032","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Green","name":"A-Chain - Green","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0033","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Silver","name":"A-Chain - Silver","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0034","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Yellow","name":"A-Chain - Yellow","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0035","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"A-Chain","desc":"Orange","name":"A-Chain - Orange","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0036","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Seperators","desc":"","name":"Seperators","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0037","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Open Coil","desc":"","name":"Open Coil","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 spools"},{"id":"SUP-0038","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Closed Coil","desc":"","name":"Closed Coil","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 spools"},{"id":"SUP-0039","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Power Thread","desc":"","name":"Power Thread","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 spools"},{"id":"SUP-0040","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Comfort Tubing","desc":"","name":"Comfort Tubing","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 spools"},{"id":"SUP-0041","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"Lingual Retainer Wire","desc":"","name":"Lingual Retainer Wire","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 spool"},{"id":"SUP-0042","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"RPE Key","desc":"","name":"RPE Key","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4"},{"id":"SUP-0043","cabinets":{"Tampa":"1","Palmetto":"1","St. Pete":"1","Largo":"1"},"item":"RPE Key","desc":"","name":"RPE Key","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0044","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Flame","name":"Burs - Flame","type":"Good/Low","unit":"5 per pack","threshold":null,"thresholdDesc":"Less than or equal to 10 burs"},{"id":"SUP-0045","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Round (Slow Speed)","name":"Burs - Round (Slow Speed)","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5 burs"},{"id":"SUP-0046","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Diamond Football","name":"Burs - Diamond Football","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 burs"},{"id":"SUP-0047","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Carbide Football","name":"Burs - Carbide Football","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 burs"},{"id":"SUP-0048","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Donut","name":"Burs - Donut","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 burs"},{"id":"SUP-0049","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Ceramic","name":"Burs - Ceramic","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"none"},{"id":"SUP-0050","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Cross-cut","name":"Burs - Cross-cut","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5 burs"},{"id":"SUP-0051","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Diamond Mosquito Bur","name":"Burs - Diamond Mosquito Bur","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 burs"},{"id":"SUP-0052","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Burs","desc":"Chamfer Bur","name":"Burs - Chamfer Bur","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0053","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Lidocaine HCl 2%","desc":"","name":"Lidocaine HCl 2%","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5 carpules"},{"id":"SUP-0054","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Disposable Dental Needles","desc":"30G-S (0.31x21mm)","name":"Disposable Dental Needles - 30G-S (0.31x21mm)","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5"},{"id":"SUP-0055","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"IPR Strips","desc":"Single-sided","name":"IPR Strips - Single-sided","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10 strips"},{"id":"SUP-0056","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"IPR Strips","desc":"Double-Sided","name":"IPR Strips - Double-Sided","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10 strips"},{"id":"SUP-0057","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"IPR Strips","desc":"Perforated, Single-sided","name":"IPR Strips - Perforated, Single-sided","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10 strips"},{"id":"SUP-0058","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"IPR Strips","desc":"Perforated, Double-sided","name":"IPR Strips - Perforated, Double-sided","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10 strips"},{"id":"SUP-0059","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Buttons","desc":"Metal","name":"Buttons - Metal","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 20 "},{"id":"SUP-0060","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Buttons","desc":"Ceramic","name":"Buttons - Ceramic","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0061","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Traction Hooks","desc":"","name":"Traction Hooks","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0062","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Bondable Button Hooks","desc":"Left","name":"Bondable Button Hooks - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0063","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Bondable Button Hooks","desc":"Right","name":"Bondable Button Hooks - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0064","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Eyelets","desc":"","name":"Eyelets","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0065","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Crimpable Split Stops","desc":"","name":"Crimpable Split Stops","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0066","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Crimpable Hook","desc":"","name":"Crimpable Hook","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0067","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Sliding Crimpable Hook","desc":"Left","name":"Sliding Crimpable Hook - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0068","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Sliding Crimpable Hook","desc":"Right","name":"Sliding Crimpable Hook - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0069","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Closing Coils","desc":"0.008*9mm","name":"Closing Coils - 0.008*9mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0070","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Closing Coils","desc":"0.008*6mm","name":"Closing Coils - 0.008*6mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0071","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Tongue Tamers","desc":"","name":"Tongue Tamers","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0072","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Bonding Lingual Small Cleat","desc":"","name":"Bonding Lingual Small Cleat","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10"},{"id":"SUP-0073","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Warren Torquing Springs","desc":"Big","name":"Warren Torquing Springs - Big","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5"},{"id":"SUP-0074","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Warren Torquing Springs","desc":"Middle","name":"Warren Torquing Springs - Middle","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5"},{"id":"SUP-0075","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Warren Torquing Springs","desc":"Small","name":"Warren Torquing Springs - Small","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5"},{"id":"SUP-0076","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Steel ties","desc":"","name":"Steel ties","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 20 ties"},{"id":"SUP-0077","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"K-ties","desc":"","name":"K-ties","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 20 ties"},{"id":"SUP-0078","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Rapid Eruptor Attachments","desc":"","name":"Rapid Eruptor Attachments","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2"},{"id":"SUP-0079","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"Elastic Hook Tools","desc":"","name":"Elastic Hook Tools","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 10 remaining"},{"id":"SUP-0080","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"RPE Swivel Keys","desc":"","name":"RPE Swivel Keys","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4"},{"id":"SUP-0081","cabinets":{"Tampa":"2","Palmetto":"2","St. Pete":"2","Largo":"2"},"item":"RPE Swivel Keys","desc":"","name":"RPE Swivel Keys","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0082","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Elbows","desc":"Short","name":"Elbows - Short","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 sets"},{"id":"SUP-0083","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Elbows","desc":"Long","name":"Elbows - Long","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 sets"},{"id":"SUP-0084","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Shims","desc":"1mm","name":"Shims - 1mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 6"},{"id":"SUP-0085","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Shims","desc":"2mm","name":"Shims - 2mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4"},{"id":"SUP-0086","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Shims","desc":"3mm","name":"Shims - 3mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4"},{"id":"SUP-0087","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Shims","desc":"4mm","name":"Shims - 4mm","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4"},{"id":"SUP-0088","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Etch","desc":"","name":"Etch","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 of bottle remaining"},{"id":"SUP-0089","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"L-pop","desc":"","name":"L-pop","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0090","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Blue glue","desc":"","name":"Blue glue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 syringes"},{"id":"SUP-0091","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Brace Cement","desc":"","name":"Brace Cement","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 syringes"},{"id":"SUP-0092","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Flowable","desc":"","name":"Flowable","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3 syringes"},{"id":"SUP-0093","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Ketac","desc":"Powder","name":"Ketac - Powder","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 of bottle remaining"},{"id":"SUP-0094","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Ketac","desc":"Liquid","name":"Ketac - Liquid","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 of bottle remaining"},{"id":"SUP-0095","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Twin Brackets (Mini)","desc":"Allure","name":"Twin Brackets (Mini) - Allure","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 full sets"},{"id":"SUP-0096","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Gold Brackets","desc":"","name":"Gold Brackets","type":"Quantity","unit":"","threshold":5.0,"thresholdDesc":"Less than or equal to 5 full sets"},{"id":"SUP-0097","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Ceramic Brackets","desc":"Full Sets","name":"Ceramic Brackets - Full Sets","type":"Quantity","unit":"","threshold":5.0,"thresholdDesc":"Less than or equal to 5 full sets"},{"id":"SUP-0098","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Upper 6s","desc":"Left","name":"Upper 6s - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0099","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Upper 6s","desc":"Right","name":"Upper 6s - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0100","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Lower 6s","desc":"Left","name":"Lower 6s - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0101","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Lower 6s","desc":"Right","name":"Lower 6s - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0102","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Upper 7s","desc":"Left","name":"Upper 7s - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0103","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Upper 7s","desc":"Right","name":"Upper 7s - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0104","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Lower 7s","desc":"Left","name":"Lower 7s - Left","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0105","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Lower 7s","desc":"Right","name":"Lower 7s - Right","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 15 brackets"},{"id":"SUP-0106","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Vitamin E Capsules","desc":"","name":"Vitamin E Capsules","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of bottle remaining"},{"id":"SUP-0107","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Chlorhexadine Gluconate ","desc":"","name":"Chlorhexadine Gluconate ","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 of bottle remaining"},{"id":"SUP-0108","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Topicle","desc":"","name":"Topicle","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of bottle remaining"},{"id":"SUP-0109","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"TADs","desc":"6mm","name":"TADs - 6mm","type":"Quantity","unit":"","threshold":2.0,"thresholdDesc":"Less than or equal to 2"},{"id":"SUP-0110","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"TADs","desc":"8mm","name":"TADs - 8mm","type":"Quantity","unit":"","threshold":2.0,"thresholdDesc":"Less than or equal to 2"},{"id":"SUP-0111","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"TADs","desc":"10mm","name":"TADs - 10mm","type":"Quantity","unit":"","threshold":2.0,"thresholdDesc":"Less than or equal to 2"},{"id":"SUP-0112","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Chewies","desc":"","name":"Chewies","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5 packs"},{"id":"SUP-0113","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Z250 Composite","desc":"A1","name":"Z250 Composite - A1","type":"Quantity","unit":"","threshold":3.0,"thresholdDesc":"Less than or equal to 3 capsules"},{"id":"SUP-0114","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Z250 Composite","desc":"A2","name":"Z250 Composite - A2","type":"Quantity","unit":"","threshold":3.0,"thresholdDesc":"Less than or equal to 3 capsules"},{"id":"SUP-0115","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Z250 Composite","desc":"B1","name":"Z250 Composite - B1","type":"Quantity","unit":"","threshold":3.0,"thresholdDesc":"Less than or equal to 3 capsules"},{"id":"SUP-0116","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Z250 Composite","desc":"B2","name":"Z250 Composite - B2","type":"Quantity","unit":"","threshold":3.0,"thresholdDesc":"Less than or equal to 3 capsules"},{"id":"SUP-0117","cabinets":{"Tampa":"3","Palmetto":"3","St. Pete":"3","Largo":"3"},"item":"Z250 Composite","desc":"","name":"Z250 Composite","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":""},{"id":"SUP-0118","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"Sterilization Bags","desc":"5.25\" x 10\"","name":"Sterilization Bags - 5.25\" x 10\"","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0119","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"Sterilization Bags","desc":"2.25\" x 5\"","name":"Sterilization Bags - 2.25\" x 5\"","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0120","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"Sterilization Bags","desc":"3.5\" x 10\"","name":"Sterilization Bags - 3.5\" x 10\"","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0121","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"Sterilization Bags","desc":"3.5\" x 6.5\"","name":"Sterilization Bags - 3.5\" x 6.5\"","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0122","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Blue","name":"GAC Chain - Blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0123","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Light blue","name":"GAC Chain - Light blue","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0124","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Purple","name":"GAC Chain - Purple","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0125","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Pink","name":"GAC Chain - Pink","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0126","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Black","name":"GAC Chain - Black","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0127","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Clear","name":"GAC Chain - Clear","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0128","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"White","name":"GAC Chain - White","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0129","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Aqua","name":"GAC Chain - Aqua","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0130","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Red","name":"GAC Chain - Red","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0131","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Green","name":"GAC Chain - Green","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0132","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Silver","name":"GAC Chain - Silver","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0133","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"Orange","name":"GAC Chain - Orange","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 spool"},{"id":"SUP-0134","cabinets":{"Tampa":"4","Palmetto":"4","St. Pete":"4","Largo":"4"},"item":"GAC Chain","desc":"","name":"GAC Chain","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0135","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Tray Covers","desc":"","name":"Tray Covers","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0136","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Facemasks","desc":"","name":"Facemasks","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"5 boxes or less"},{"id":"SUP-0137","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Bibs","desc":"","name":"Bibs","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0138","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Gloves","desc":"M","name":"Gloves - M","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"5 boxes or less"},{"id":"SUP-0139","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Cavicide Wipes","desc":"","name":"Cavicide Wipes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"5 canisters or less"},{"id":"SUP-0140","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Aligner Remover Hooks","desc":"","name":"Aligner Remover Hooks","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2 remaining"},{"id":"SUP-0141","cabinets":{"Tampa":"5","Palmetto":"5","St. Pete":"5","Largo":"5"},"item":"Aligner Remover Hooks","desc":"","name":"Aligner Remover Hooks","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0142","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Air-Water Syringes","desc":"","name":"Air-Water Syringes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 1 pack"},{"id":"SUP-0143","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Low-Volume Suction","desc":"","name":"Low-Volume Suction","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 packs"},{"id":"SUP-0144","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"High-Volume Suction","desc":"","name":"High-Volume Suction","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 packs"},{"id":"SUP-0145","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"2x2s","desc":"","name":"2x2s","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 2 packs"},{"id":"SUP-0146","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Cotton Rolls","desc":"","name":"Cotton Rolls","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 5 packs"},{"id":"SUP-0147","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Dri-Angles","desc":"","name":"Dri-Angles","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0148","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Cotton Swabs","desc":"","name":"Cotton Swabs","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 10 swabs"},{"id":"SUP-0149","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Microbrushes","desc":"","name":"Microbrushes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 4 tubes"},{"id":"SUP-0150","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Alcohol Wipes","desc":"","name":"Alcohol Wipes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"3 canisters or less"},{"id":"SUP-0151","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Floss threaders","desc":"","name":"Floss threaders","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0152","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Floss","desc":"","name":"Floss","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0153","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Interproximal Brushes","desc":"","name":"Interproximal Brushes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0154","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Patient Wax","desc":"","name":"Patient Wax","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 10 remaining"},{"id":"SUP-0155","cabinets":{"Tampa":"6","Palmetto":"6","St. Pete":"6","Largo":"6"},"item":"Patient Wax","desc":"","name":"Patient Wax","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0156","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"012Niti","desc":"Normal, ovoid","name":"012Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0157","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"014Niti","desc":"Normal, ovoid","name":"014Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0158","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"018Niti","desc":"Normal, ovoid","name":"018Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0159","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"16x25Niti","desc":"Normal, ovoid","name":"16x25Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0160","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"18x25Niti","desc":"Normal, ovoid","name":"18x25Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0161","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"19x25Niti","desc":"Normal, ovoid","name":"19x25Niti - Normal, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0162","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"018Niti RCOS","desc":"","name":"018Niti RCOS","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0163","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"16x22Niti RCOS","desc":"","name":"16x22Niti RCOS","type":"Quantity","unit":"","threshold":20.0,"thresholdDesc":"Less than or equal to 20 wires"},{"id":"SUP-0164","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"018 Stainless Steel ","desc":"","name":"018 Stainless Steel ","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0165","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"18x25 Stainless Steel","desc":"","name":"18x25 Stainless Steel","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0166","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"012Niti","desc":"Gold, ovoid","name":"012Niti - Gold, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0167","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"014Niti","desc":"Gold, ovoid","name":"014Niti - Gold, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0168","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"018Niti","desc":"Gold, ovoid","name":"018Niti - Gold, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0169","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"16x25Niti","desc":"Gold, ovoid","name":"16x25Niti - Gold, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0170","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"18x25Niti","desc":"Gold, ovoid","name":"18x25Niti - Gold, ovoid","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0171","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"012Niti","desc":"Narrow Arch Form","name":"012Niti - Narrow Arch Form","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0172","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"014Niti","desc":"Narrow Arch Form","name":"014Niti - Narrow Arch Form","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0173","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"018Niti","desc":"Narrow Arch Form","name":"018Niti - Narrow Arch Form","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0174","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"16x25Niti","desc":"Narrow Arch Form","name":"16x25Niti - Narrow Arch Form","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0175","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"18x25Niti","desc":"Narrow Arch Form","name":"18x25Niti - Narrow Arch Form","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":"Less than or equal to 10 wires"},{"id":"SUP-0176","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"Facemask Headgear","desc":"","name":"Facemask Headgear","type":"Quantity","unit":"","threshold":1.0,"thresholdDesc":"1 or none"},{"id":"SUP-0177","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"RPHG","desc":"","name":"RPHG","type":"Quantity","unit":"","threshold":1.0,"thresholdDesc":"1 or none"},{"id":"SUP-0178","cabinets":{"Tampa":"7","Palmetto":"7","St. Pete":"7","Largo":"7"},"item":"RPHG","desc":"","name":"RPHG","type":"Quantity","unit":"","threshold":10.0,"thresholdDesc":""},{"id":"SUP-0179","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"U-Lab Material","desc":"125mm circle","name":"U-Lab Material - 125mm circle","type":"Quantity","unit":"","threshold":0.5,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0180","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Essix Material","desc":"Normal","name":"Essix Material - Normal","type":"Quantity","unit":"25 per pack","threshold":0.5,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0181","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Essix Material","desc":"Thick","name":"Essix Material - Thick","type":"Quantity","unit":"","threshold":0.5,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0182","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Retainer Cases","desc":"","name":"Retainer Cases","type":"Quantity","unit":"","threshold":0.5,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0183","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Mouthguards","desc":"","name":"Mouthguards","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than or equal to 3"},{"id":"SUP-0184","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"3D Printing Resin","desc":"","name":"3D Printing Resin","type":"Quantity","unit":"","threshold":0.5,"thresholdDesc":"Less than 1/2 of bottle"},{"id":"SUP-0185","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Microfiber towels","desc":"","name":"Microfiber towels","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2"},{"id":"SUP-0186","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"U-lab pouches","desc":"","name":"U-lab pouches","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 20 pouches"},{"id":"SUP-0187","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Ortho baggies","desc":"","name":"Ortho baggies","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 20 baggies"},{"id":"SUP-0188","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Retainer Buffing Wheels","desc":"","name":"Retainer Buffing Wheels","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 3 "},{"id":"SUP-0189","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Isopropyl Alcohol","desc":"","name":"Isopropyl Alcohol","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of botte"},{"id":"SUP-0190","cabinets":{"Tampa":"8","Palmetto":"8","St. Pete":"8","Largo":"8"},"item":"Isopropyl Alcohol","desc":"","name":"Isopropyl Alcohol","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0191","cabinets":{"Tampa":"9","Palmetto":"9","St. Pete":"9","Largo":"9"},"item":"Cavicide","desc":"","name":"Cavicide","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1 bottle"},{"id":"SUP-0192","cabinets":{"Tampa":"9","Palmetto":"9","St. Pete":"9","Largo":"9"},"item":"Maxicide","desc":"","name":"Maxicide","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2 bottles"},{"id":"SUP-0193","cabinets":{"Tampa":"9","Palmetto":"9","St. Pete":"9","Largo":"9"},"item":"Lubricant","desc":"","name":"Lubricant","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0194","cabinets":{"Tampa":"9","Palmetto":"9","St. Pete":"9","Largo":"9"},"item":"Maxizyme Tabs","desc":"","name":"Maxizyme Tabs","type":"Good/Low","unit":"64 per pack","threshold":null,"thresholdDesc":"Less than 15 tablets"},{"id":"SUP-0195","cabinets":{"Tampa":"9","Palmetto":"9","St. Pete":"9","Largo":"9"},"item":"Maxizyme Tabs","desc":"","name":"Maxizyme Tabs","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0196","cabinets":{"Tampa":"10","Palmetto":"10","St. Pete":"10","Largo":"10"},"item":"Start Kits","desc":"","name":"Start Kits","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0197","cabinets":{"Tampa":"10","Palmetto":"10","St. Pete":"10","Largo":"10"},"item":"Gloves","desc":"XS","name":"Gloves - XS","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"5 boxes or less"},{"id":"SUP-0198","cabinets":{"Tampa":"10","Palmetto":"10","St. Pete":"10","Largo":"10"},"item":"Gloves","desc":"S","name":"Gloves - S","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"5 boxes or less"},{"id":"SUP-0199","cabinets":{"Tampa":"10","Palmetto":"10","St. Pete":"10","Largo":"10"},"item":"Gloves","desc":"","name":"Gloves","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0200","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Single-use toothbrushes","desc":"","name":"Single-use toothbrushes","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0201","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Gorilla","name":"Elastics - Gorilla","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0202","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Bald Eagle","name":"Elastics - Bald Eagle","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0203","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Falcon","name":"Elastics - Falcon","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0204","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Sea Lion","name":"Elastics - Sea Lion","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0205","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Egret","name":"Elastics - Egret","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0206","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"Jaguar","name":"Elastics - Jaguar","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/2 left in box being used"},{"id":"SUP-0207","cabinets":{"Tampa":"Sink/Back Cabinet","Palmetto":"Sink/Back Cabinet","St. Pete":"Sink/Back Cabinet","Largo":"Sink/Back Cabinet"},"item":"Elastics","desc":"","name":"Elastics","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0208","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Porcelain Conditioner","desc":"","name":"Porcelain Conditioner","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of bottles"},{"id":"SUP-0209","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Porcelain Etch","desc":"","name":"Porcelain Etch","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of bottles"},{"id":"SUP-0210","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Toilet Paper","desc":"","name":"Toilet Paper","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2 rolls remaining"},{"id":"SUP-0211","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"C-folds","desc":"","name":"C-folds","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2 packs left"},{"id":"SUP-0212","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Paper Towels","desc":"","name":"Paper Towels","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 2 rolls remaining"},{"id":"SUP-0213","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Trash Bags","desc":"","name":"Trash Bags","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0214","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Coffee","desc":"","name":"Coffee","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0215","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Handsoap","desc":"Refillable (Toothbrushing Station)","name":"Handsoap - Refillable (Toothbrushing Station)","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 1/4 of bottles"},{"id":"SUP-0216","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Handsoap","desc":"Bathrooms","name":"Handsoap - Bathrooms","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"1 bag remaining"},{"id":"SUP-0217","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Copy Paper","desc":"","name":"Copy Paper","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"1 ream remaining"},{"id":"SUP-0218","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Disposable Cups","desc":"","name":"Disposable Cups","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":"Less than 25 cups remaining"},{"id":"SUP-0219","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0220","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0221","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0222","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0223","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""},{"id":"SUP-0224","cabinets":{"Tampa":"Extras","Palmetto":"Extras","St. Pete":"Extras","Largo":"Extras"},"item":"Solid Collector Screens","desc":"","name":"Solid Collector Screens","type":"Good/Low","unit":"","threshold":null,"thresholdDesc":""}];
const SEED_STAFF = ["Ariyae", "Brooklynn", "Ian", "Leann", "Lynn", "Marshall", "Rylee", "Taylor", "Dr. Berry", "Dr. Gonzalez", "Dr. Mann"];
const SEED_DISTRIBUTORS = ["3M", "4imprint", "Allure", "Amazon", "Amtouch", "AO", "AOA Lab", "BestValueCopy", "Dental City", "Dentaurum", "Dentsply Sirona", "Dynaflex", "Ebay", "forestadentusa", "Henry Schein", "Isoglides", "Net32", "Orthopli", "Philips", "Reliance", "RMO", "Sams Club", "Specialty", "Speed System", "Voxel Dental", "Other"];
const LOCATIONS = ["Tampa", "Palmetto", "St. Pete", "Largo"];
const LOC_FIELD = { "Tampa": "tampa", "Palmetto": "palmetto", "St. Pete": "stpete", "Largo": "largo" };
const SHIP_LOCATIONS = [...LOCATIONS, "Dr. Mann's"];
const LOCATION_WEIGHTS = { "Palmetto": 4, "Tampa": 3, "St. Pete": 2, "Largo": 1 };

// Splits a total quantity across the given locations, weighted so Palmetto gets the
// largest share, then Tampa, then St. Pete, then Largo - while keeping the parts
// summing exactly to the total (remainder goes to whichever location's rounded-down
// amount was furthest below its fair share).
function weightedSplit(total, locations) {
  const weights = locations.map((l) => LOCATION_WEIGHTS[l] || 1);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w);
  const result = [...floors];
  for (let k = 0; k < remainder && order.length > 0; k++) {
    result[order[k % order.length].i] += 1;
  }
  const splitByLoc = {};
  locations.forEach((loc, idx) => { splitByLoc[loc] = result[idx]; });
  return splitByLoc;
}

/* ============================== HELPERS ============================== */
function keyFor(location, itemId) { return location + "::" + itemId; }

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function suggestedStatus(item, count) {
  if (item.type !== "Quantity") return null;
  if (count === "" || count === null || count === undefined || isNaN(count)) return null;
  const c = Number(count);
  const t = item.threshold || 0;
  if (c <= t) return "Need to Order";
  if (c <= t * 1.5) return "Low";
  return "Good";
}

function effectiveStatus(item, check) {
  if (!check) return null;
  if (item.type === "Quantity") return suggestedStatus(item, check.count);
  return check.status || null;
}

function receivedSince(shipments, transfers, itemId, location, sinceDate) {
  const field = LOC_FIELD[location];
  // Direct credit: shipments that landed at this location - either because this
  // location IS the ship-to address, or (for older records with no ship-to set)
  // because we fall back to the old "goes straight to each location" behavior.
  const direct = shipments
    .filter((s) => s.itemId === itemId && s.status === "Received" && s.dateReceived &&
      (!sinceDate || s.dateReceived > sinceDate) &&
      (!s.shipTo || s.shipTo === location))
    .reduce((sum, s) => sum + (Number(s[field]) || 0), 0);
  // Transferred credit: portions that arrived somewhere else first and have since
  // been confirmed as physically moved to this location.
  const transferred = (transfers || [])
    .filter((t) => t.itemId === itemId && t.toLocation === location && t.status === "Received" && t.dateReceived &&
      (!sinceDate || t.dateReceived > sinceDate))
    .reduce((sum, t) => sum + (Number(t.qty) || 0), 0);
  return direct + transferred;
}

function liveStock(item, location, checks, shipments, transfers) {
  const check = checks[keyFor(location, item.id)];
  const lastCount = check && check.count !== "" && check.count !== undefined ? Number(check.count) : 0;
  const lastDate = check ? check.date : null;
  const rec = receivedSince(shipments, transfers, item.id, location, lastDate);
  return lastCount + rec;
}

function invStatus(item, stock) {
  const t = item.threshold || 0;
  if (stock <= t) return "REORDER NOW";
  if (stock <= t * 1.5) return "Low";
  return "OK";
}

function statusColor(status) {
  if (status === "Need to Order" || status === "REORDER NOW") return "var(--reorder)";
  if (status === "Low") return "var(--low)";
  if (status === "Good" || status === "OK") return "var(--good)";
  return "var(--ink-soft)";
}

function statusBg(status) {
  if (status === "Need to Order" || status === "REORDER NOW") return "var(--reorder-bg)";
  if (status === "Low") return "var(--low-bg)";
  if (status === "Good" || status === "OK") return "var(--good-bg)";
  return "var(--line)";
}

function upsertQueueEntry(queue, itemId, location, detail) {
  const idx = queue.findIndex((q) => q.itemId === itemId && (q.status === "Pending" || q.status === "Ordered"));
  if (idx === -1) {
    const entry = {
      id: uid("Q"), dateFlagged: todayISO(), itemId,
      locations: [location], details: { [location]: detail },
      distributor: "", status: "Pending", dateOrdered: "", staff: detail.staff || "", notes: "",
      qtyToOrder: "", shipmentCreated: false,
    };
    return [...queue, entry];
  }
  const existing = queue[idx];
  const nextLocations = existing.locations.includes(location) ? existing.locations : [...existing.locations, location];
  const nextDetails = { ...existing.details, [location]: detail };
  const next = { ...existing, locations: nextLocations, details: nextDetails };
  return queue.map((q, i) => (i === idx ? next : q));
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================== STORAGE HOOK ============================== */
function useSharedState(storageKey, initialValue) {
  const [value, setStateValue] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getValue(storageKey, true);
        if (raw) {
          setStateValue(JSON.parse(raw));
        }
      } catch (err) {
        // key doesn't exist yet - keep initial value
      } finally {
        setLoaded(true);
      }
    })();
  }, [storageKey]);

  const persist = useCallback(async (next) => {
    setStateValue(next);
    try {
      await setValue(storageKey, JSON.stringify(next), true);
    } catch (err) {
      console.error("Storage save failed for", storageKey, err);
    }
  }, [storageKey]);

  return [value, persist, loaded];
}

/* ============================== SMALL UI PIECES ============================== */
function Badge({ status, small }) {
  if (!status) return <span className="badge badge-empty">Not checked</span>;
  return (
    <span
      className={"badge" + (small ? " badge-sm" : "")}
      style={{ color: statusColor(status), background: statusBg(status) }}
    >
      {status}
    </span>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select className="select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "\u2014"}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function LocationTabs({ active, onChange, counts }) {
  return (
    <div className="drawer-tabs">
      {LOCATIONS.map((loc) => {
        const c = counts ? counts[loc] || 0 : 0;
        return (
          <button
            key={loc}
            className={"drawer-tab" + (active === loc ? " drawer-tab-active" : "")}
            onClick={() => onChange(loc)}
          >
            <span className="drawer-tab-label">{loc}</span>
            {c > 0 && <span className="drawer-tab-badge">{c}</span>}
          </button>
        );
      })}
    </div>
  );
}

function NavItem({ icon, label, active, onClick, count }) {
  return (
    <button className={"nav-item" + (active ? " nav-item-active" : "")} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ items, checks, shipments, transfers, queue, setView, setActiveLocation }) {
  const flagged = useMemo(() => {
    const rows = [];
    items.forEach((item) => {
      LOCATIONS.forEach((loc) => {
        if (item.type === "Quantity") {
          const stock = liveStock(item, loc, checks, shipments, transfers);
          const st = invStatus(item, stock);
          if (st !== "OK") rows.push({ item, loc, status: st, detail: stock + " on hand \u00b7 threshold " + item.threshold });
        } else {
          const check = checks[keyFor(loc, item.id)];
          const st = effectiveStatus(item, check);
          if (st === "Need to Order" || st === "Low") {
            rows.push({ item, loc, status: st, detail: check && check.date ? "Checked " + fmtDate(check.date) : "" });
          }
        }
      });
    });
    rows.sort((a, b) => {
      const rank = (s) => (s === "REORDER NOW" || s === "Need to Order" ? 0 : 1);
      return rank(a.status) - rank(b.status);
    });
    return rows;
  }, [items, checks, shipments]);

  const locCounts = useMemo(() => {
    const c = {};
    LOCATIONS.forEach((loc) => { c[loc] = flagged.filter((f) => f.loc === loc && (f.status === "REORDER NOW" || f.status === "Need to Order")).length; });
    return c;
  }, [flagged]);

  const pendingOrders = queue.filter((q) => q.status === "Pending" || q.status === "Ordered").length;

  return (
    <div className="view">
      <div className="view-header">
        <h1>Mann Orthodontics Supply</h1>
        <p className="view-sub">{fmtDate(todayISO())} \u00b7 4 locations \u00b7 {items.length} items tracked</p>
      </div>

      <div className="card-grid">
        {LOCATIONS.map((loc) => (
          <button key={loc} className="loc-card" onClick={() => { setActiveLocation(loc); setView("checkin"); }}>
            <div className="loc-card-top">
              <span className="loc-card-name">{loc}</span>
              <span className="loc-card-dot" style={{ background: locCounts[loc] > 0 ? "var(--reorder)" : "var(--good)" }} />
            </div>
            <div className="loc-card-count">{locCounts[loc]}</div>
            <div className="loc-card-label">need ordering</div>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Needs attention</h2>
          <span className="pill">{flagged.length} flagged</span>
        </div>
        {flagged.length === 0 ? (
          <div className="empty-state">Nothing flagged right now \u2014 all locations are stocked.</div>
        ) : (
          <div className="flag-list">
            {flagged.slice(0, 40).map((f, i) => (
              <div className="flag-row" key={i}>
                <span className="flag-dot" style={{ background: statusColor(f.status) }} />
                <div className="flag-main">
                  <div className="flag-name">{f.item.name}</div>
                  <div className="flag-meta">{f.loc} \u00b7 {f.detail}</div>
                </div>
                <Badge status={f.status} small />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Ordering queue</h2>
          <span className="pill">{pendingOrders} open</span>
        </div>
        <button className="btn btn-secondary" onClick={() => setView("queue")}>Review queue \u2192</button>
      </div>
    </div>
  );
}

/* ============================== CHECK-IN ============================== */
function ItemRow({ item, check, staff, location, onSave }) {
  const [count, setCount] = useState(check && check.count !== undefined ? check.count : "");
  const [notes, setNotes] = useState(check ? check.notes || "" : "");

  useEffect(() => {
    setCount(check && check.count !== undefined ? check.count : "");
    setNotes(check ? check.notes || "" : "");
  }, [check]);

  if (item.type === "Quantity") {
    const sugg = suggestedStatus(item, count);
    const dirty = String(count) !== String(check && check.count !== undefined ? check.count : "");
    return (
      <div className="item-row">
        <div className="item-main">
          <div className="item-name">{item.name}</div>
          <div className="item-meta">Cabinet {item.cabinets[location]} \u00b7 threshold {item.threshold}{item.unit ? " \u00b7 " + item.unit : ""}</div>
        </div>
        <input
          className="qty-input"
          type="number"
          inputMode="decimal"
          placeholder="count"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
        <Badge status={sugg} small />
        <button
          className="btn btn-tiny"
          disabled={!dirty || count === ""}
          onClick={() => onSave(item, { count: Number(count), notes, staff })}
        >
          Save
        </button>
      </div>
    );
  }

  const status = check ? check.status : null;
  return (
    <div className="item-row">
      <div className="item-main">
        <div className="item-name">{item.name}</div>
        <div className="item-meta">Cabinet {item.cabinets[location]}{check && check.date ? " \u00b7 last checked " + fmtDate(check.date) : ""}</div>
      </div>
      <div className="status-toggle">
        {["Good", "Low", "Need to Order"].map((s) => (
          <button
            key={s}
            className={"toggle-btn" + (status === s ? " toggle-btn-active" : "")}
            style={status === s ? { background: statusBg(s), color: statusColor(s), borderColor: statusColor(s) } : {}}
            onClick={() => onSave(item, { status: s, notes, staff })}
          >
            {s === "Need to Order" ? "Order" : s}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckIn({ items, checks, activeLocation, setActiveLocation, staffList, onSaveCheck, locCounts }) {
  const [staff, setStaff] = useState("");
  const [search, setSearch] = useState("");
  const [cabinet, setCabinet] = useState("");

  const cabinets = useMemo(() => {
    const s = new Set(items.map((i) => i.cabinets[activeLocation]));
    return Array.from(s).sort((a, b) => (isNaN(a) || isNaN(b) ? String(a).localeCompare(String(b)) : Number(a) - Number(b)));
  }, [items, activeLocation]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (cabinet && i.cabinets[activeLocation] !== cabinet) return false;
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, cabinet, search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((i) => { const cab = i.cabinets[activeLocation]; (g[cab] = g[cab] || []).push(i); });
    return g;
  }, [filtered, activeLocation]);

  return (
    <div className="view">
      <div className="view-header">
        <h1>Location check-in</h1>
        <p className="view-sub">Mark stock at each location \u2014 flags route to the ordering queue automatically.</p>
      </div>

      <LocationTabs active={activeLocation} onChange={setActiveLocation} counts={locCounts} />

      <div className="panel drawer-panel">
        <div className="checkin-controls">
          <Select value={staff} onChange={setStaff} options={staffList} placeholder="Who's checking?" />
          <input className="text-input" placeholder="Search items\u2026" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={cabinet} onChange={(e) => setCabinet(e.target.value)}>
            <option value="">All cabinets</option>
            {cabinets.map((c) => <option key={c} value={c}>Cabinet {c}</option>)}
          </select>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="empty-state">No items match that search.</div>
        ) : (
          Object.keys(grouped).sort((a,b)=> (isNaN(a)||isNaN(b)? String(a).localeCompare(String(b)) : Number(a)-Number(b))).map((cab) => (
            <div key={cab} className="cabinet-group">
              <div className="cabinet-label">Cabinet {cab}</div>
              {grouped[cab].map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  check={checks[keyFor(activeLocation, item.id)]}
                  staff={staff}
                  location={activeLocation}
                  onSave={(it, patch) => onSaveCheck(it, activeLocation, patch)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================== SHIPMENTS ============================== */
function ShipmentForm({ items, distributors, onAdd }) {
  const [itemId, setItemId] = useState("");
  const [distributor, setDistributor] = useState("");
  const [po, setPo] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [dateOrdered, setDateOrdered] = useState(todayISO());
  const [total, setTotal] = useState("");
  const [split, setSplit] = useState({ tampa: "", palmetto: "", stpete: "", largo: "" });
  const [splitTouched, setSplitTouched] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  const selectedItem = items.find((i) => i.id === itemId);
  const splitSum = ["tampa", "palmetto", "stpete", "largo"].reduce((s, k) => s + (Number(split[k]) || 0), 0);
  const mismatch = total !== "" && splitSum !== Number(total);

  const applyAutoSplit = (t) => {
    if (t === "" || isNaN(Number(t))) { setSplit({ tampa: "", palmetto: "", stpete: "", largo: "" }); return; }
    const byLoc = weightedSplit(Number(t), LOCATIONS);
    setSplit({ tampa: byLoc["Tampa"], palmetto: byLoc["Palmetto"], stpete: byLoc["St. Pete"], largo: byLoc["Largo"] });
  };

  const reset = () => {
    setItemId(""); setQuery(""); setDistributor(""); setPo(""); setShipTo(""); setTotal("");
    setSplit({ tampa: "", palmetto: "", stpete: "", largo: "" }); setSplitTouched(false); setDateOrdered(todayISO());
  };

  return (
    <div className="ship-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item</label>
          <input className="text-input" placeholder="Search item name or ID\u2026" value={selectedItem ? selectedItem.name : query}
            onChange={(e) => { setQuery(e.target.value); setItemId(""); }} />
          {matches.length > 0 && !itemId && (
            <div className="autocomplete">
              {matches.map((m) => (
                <div key={m.id} className="autocomplete-item" onClick={() => { setItemId(m.id); setQuery(""); }}>
                  {m.name} <span className="muted">{m.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="form-field">
          <label>Distributor</label>
          <Select value={distributor} onChange={setDistributor} options={distributors} placeholder="Select\u2026" />
        </div>
        <div className="form-field">
          <label>PO / Order ref</label>
          <input className="text-input" value={po} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date ordered</label>
          <input className="text-input" type="date" value={dateOrdered} onChange={(e) => setDateOrdered(e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Ships to</label>
          <select className="select" value={shipTo} onChange={(e) => setShipTo(e.target.value)}>
            <option value="">Select\u2026</option>
            {SHIP_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-field-note" style={{ flex: "1 1 100%" }}>
          If this ships somewhere other than its final destination(s), the amounts for other locations
          will show up under Transfers once marked Received, instead of counting as on-hand right away.
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Total quantity ordered</label>
          <input className="text-input" type="number" value={total}
            onChange={(e) => { setTotal(e.target.value); if (!splitTouched) applyAutoSplit(e.target.value); }} />
        </div>
        {["Tampa", "Palmetto", "St. Pete", "Largo"].map((loc) => {
          const field = LOC_FIELD[loc];
          return (
            <div className="form-field" key={loc}>
              <label>{loc}</label>
              <input className="text-input" type="number" value={split[field]}
                onChange={(e) => { setSplitTouched(true); setSplit({ ...split, [field]: e.target.value }); }} />
            </div>
          );
        })}
      </div>
      <div className="form-row">
        <button type="button" className="btn btn-secondary btn-tiny" onClick={() => { setSplitTouched(false); applyAutoSplit(total); }}>
          Reset to suggested split
        </button>
      </div>

      {mismatch && <div className="warn-line">Split ({splitSum}) doesn't match total ordered ({total}) \u2014 you can still save this.</div>}

      <button
        className="btn btn-primary"
        disabled={!itemId || !total}
        onClick={() => {
          onAdd({
            id: uid("SHP"), itemId, distributor, po, shipTo, dateOrdered, status: "Ordered",
            total: Number(total), tampa: Number(split.tampa) || 0, palmetto: Number(split.palmetto) || 0,
            stpete: Number(split.stpete) || 0, largo: Number(split.largo) || 0,
            dateReceived: "", receivedBy: "", notes: "", transfersCreated: false,
          });
          reset();
        }}
      >
        Log order
      </button>
    </div>
  );
}

function ShipmentRow({ s, item, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ tampa: s.tampa, palmetto: s.palmetto, stpete: s.stpete, largo: s.largo });

  const startEdit = () => { setDraft({ tampa: s.tampa, palmetto: s.palmetto, stpete: s.stpete, largo: s.largo }); setEditing(true); };
  const save = () => {
    onUpdate(s.id, {
      tampa: Number(draft.tampa) || 0, palmetto: Number(draft.palmetto) || 0,
      stpete: Number(draft.stpete) || 0, largo: Number(draft.largo) || 0,
    });
    setEditing(false);
  };

  return (
    <div className="ship-row">
      <div className="ship-main">
        <div className="flag-name">{item ? item.name : s.itemId}</div>
        <div className="flag-meta">
          {s.distributor || "No distributor"} \u00b7 ordered {fmtDate(s.dateOrdered)} \u00b7 total {s.total}{s.shipTo ? " \u00b7 ships to " + s.shipTo : ""}
        </div>
        {!editing ? (
          <div className="flag-meta muted">
            Tampa {s.tampa} \u00b7 Palmetto {s.palmetto} \u00b7 St. Pete {s.stpete} \u00b7 Largo {s.largo}
          </div>
        ) : (
          <div className="form-row" style={{ marginTop: 6 }}>
            {["Tampa", "Palmetto", "St. Pete", "Largo"].map((loc) => {
              const field = LOC_FIELD[loc];
              return (
                <div className="form-field" key={loc}>
                  <label>{loc}</label>
                  <input className="text-input" type="number" value={draft[field]}
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
                </div>
              );
            })}
          </div>
        )}
        {s.transfersCreated && <div className="flag-meta" style={{ color: "var(--good)" }}>Transfers created for other locations \u2014 see Transfers</div>}
        {editing && s.transfersCreated && (
          <div className="warn-line">Transfers were already created from this shipment \u2014 editing quantities now won't update them.</div>
        )}
      </div>
      <div className="ship-actions">
        {editing ? (
          <>
            <button className="btn btn-primary btn-tiny" onClick={save}>Save</button>
            <button className="btn btn-secondary btn-tiny" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span className="badge" style={{
              color: s.status === "Received" ? "var(--good)" : s.status === "Partially Received" ? "var(--low)" : "var(--ink-soft)",
              background: s.status === "Received" ? "var(--good-bg)" : s.status === "Partially Received" ? "var(--low-bg)" : "var(--line)",
            }}>{s.status}</span>
            <button className="btn btn-secondary btn-tiny" onClick={startEdit}>Edit quantities</button>
            {s.status !== "Received" && (
              <button className="btn btn-tiny" onClick={() => onUpdate(s.id, { status: "Received", dateReceived: todayISO() })}>
                Mark received
              </button>
            )}
            {s.status === "Received" && <span className="muted">Received {fmtDate(s.dateReceived)}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function ShipmentsView({ items, shipments, distributors, staffList, onAdd, onUpdate }) {
  const [filter, setFilter] = useState("All");
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const filtered = shipments.filter((s) => filter === "All" || s.status === filter).sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Shipments</h1>
        <p className="view-sub">Log what you ordered \u2014 mark it Received when it arrives to update inventory automatically.</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Log a new order</h2></div>
        <ShipmentForm items={items} distributors={distributors} onAdd={onAdd} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Order history</h2>
          <div className="filter-chips">
            {["All", "Ordered", "Partially Received", "Received"].map((f) => (
              <button key={f} className={"chip" + (filter === f ? " chip-active" : "")} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">No shipments logged yet.</div>
        ) : (
          <div className="ship-list">
            {filtered.map((s) => (
              <ShipmentRow key={s.id} s={s} item={itemById[s.itemId]} onUpdate={onUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== ORDERING QUEUE ============================== */
function LocationToggle({ locations, onChange }) {
  const allSelected = LOCATIONS.every((l) => locations.includes(l));
  return (
    <div className="loc-toggle">
      {LOCATIONS.map((loc) => (
        <button key={loc} type="button"
          className={"loc-chip" + (locations.includes(loc) ? " loc-chip-active" : "")}
          onClick={() => {
            const next = locations.includes(loc) ? locations.filter((l) => l !== loc) : [...locations, loc];
            if (next.length > 0) onChange(next);
          }}>
          {loc}
        </button>
      ))}
      <button type="button" className={"loc-chip loc-chip-all" + (allSelected ? " loc-chip-active" : "")}
        onClick={() => onChange(allSelected ? [locations[0] || LOCATIONS[0]] : [...LOCATIONS])}>
        All 4
      </button>
    </div>
  );
}

function QueueRow({ q, item, distributors, staffList, onUpdate }) {
  const [notes, setNotes] = useState(q.notes || "");
  const ready = q.distributor && Number(q.qtyToOrder) > 0;

  useEffect(() => { setNotes(q.notes || ""); }, [q.notes]);

  const handleLocationChange = (next) => {
    const nextDetails = { ...q.details };
    next.forEach((loc) => { if (!nextDetails[loc]) nextDetails[loc] = { qty: null, reason: "Added manually" }; });
    onUpdate(q.id, { locations: next, details: nextDetails });
  };

  return (
    <div className="queue-row">
      <div className="queue-main">
        <div className="flag-name">{item ? item.name : q.itemId}</div>
        <div className="flag-meta">flagged {fmtDate(q.dateFlagged)}</div>
        <div className="flag-meta muted">
          {q.locations.map((loc) => {
            const d = q.details[loc];
            const suffix = d && d.qty !== null && d.qty !== undefined ? ": " + d.qty : "";
            return loc + suffix;
          }).join("  \u00b7  ")}
        </div>
        <div style={{ marginTop: 6 }}>
          <LocationToggle locations={q.locations} onChange={handleLocationChange} />
        </div>
        {q.shipmentCreated && <div className="flag-meta" style={{ color: "var(--good)" }}>Shipment logged automatically \u00b7 split across {q.locations.length} location{q.locations.length > 1 ? "s" : ""}</div>}
      </div>
      <div className="queue-fields">
        <input className="text-input qty-order-input" type="number" placeholder="Qty to order"
          value={q.qtyToOrder ?? ""} onChange={(e) => onUpdate(q.id, { qtyToOrder: e.target.value })} />
        <Select value={q.distributor} onChange={(v) => onUpdate(q.id, { distributor: v })} options={distributors} placeholder="Distributor" />
        <select className="select" value={q.status} onChange={(e) => onUpdate(q.id, { status: e.target.value })}>
          {["Pending", "Ordered", "Received", "Not Needed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Select value={q.staff} onChange={(v) => onUpdate(q.id, { staff: v })} options={staffList} placeholder="Staff" />
      </div>
      <textarea className="text-input queue-notes" rows={2} placeholder="Notes or special instructions\u2026"
        value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onUpdate(q.id, { notes })} />
      {q.status === "Ordered" && !ready && (
        <div className="warn-line">Add a distributor and a quantity to auto-log this as a shipment.</div>
      )}
    </div>
  );
}

function AddToQueueForm({ items, onAdd }) {
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  const selectedItem = items.find((i) => i.id === itemId);
  const reset = () => { setQuery(""); setItemId(""); setLocations([]); };

  if (!open) {
    return <button className="btn btn-accent" onClick={() => setOpen(true)}>+ Add item manually</button>;
  }

  return (
    <div className="add-item-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item</label>
          <input className="text-input" placeholder="Search item name or ID\u2026" value={selectedItem ? selectedItem.name : query}
            onChange={(e) => { setQuery(e.target.value); setItemId(""); }} />
          {matches.length > 0 && !itemId && (
            <div className="autocomplete">
              {matches.map((m) => (
                <div key={m.id} className="autocomplete-item" onClick={() => { setItemId(m.id); setQuery(""); }}>
                  {m.name} <span className="muted">{m.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Locations</label>
          <LocationToggle locations={locations} onChange={setLocations} />
        </div>
      </div>
      <div className="form-row">
        <button className="btn btn-primary" disabled={!itemId || locations.length === 0}
          onClick={() => { onAdd(itemId, locations); reset(); setOpen(false); }}>
          Add to queue
        </button>
        <button className="btn btn-secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

function QueueView({ items, queue, distributors, staffList, onUpdate, onManualAdd }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");

  const pending = queue.filter((q) => q.status === "Pending").sort((a, b) => (b.dateFlagged || "").localeCompare(a.dateFlagged || ""));
  const history = queue.filter((q) => q.status !== "Pending")
    .filter((q) => historyFilter === "All" || q.status === historyFilter)
    .sort((a, b) => (b.dateFlagged || "").localeCompare(a.dateFlagged || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Ordering queue</h1>
        <p className="view-sub">Items land here automatically when marked Need to Order on a check-in.</p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Needs action</h2>
          <span className="pill">{pending.length} pending</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <AddToQueueForm items={items} onAdd={onManualAdd} />
        </div>
        {pending.length === 0 ? (
          <div className="empty-state">Nothing pending right now.</div>
        ) : (
          <div className="queue-list">
            {pending.map((q) => (
              <QueueRow key={q.id} q={q} item={itemById[q.itemId]} distributors={distributors} staffList={staffList} onUpdate={onUpdate} />
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <button className="btn btn-secondary" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? "Hide" : "Show"} order history ({history.length})
        </button>
        {showHistory && (
          <div style={{ marginTop: 12 }}>
            <div className="filter-chips" style={{ marginBottom: 10 }}>
              {["All", "Ordered", "Received", "Not Needed"].map((f) => (
                <button key={f} className={"chip" + (historyFilter === f ? " chip-active" : "")} onClick={() => setHistoryFilter(f)}>{f}</button>
              ))}
            </div>
            {history.length === 0 ? (
              <div className="empty-state">Nothing here yet.</div>
            ) : (
              <div className="queue-list">
                {history.map((q) => (
                  <QueueRow key={q.id} q={q} item={itemById[q.itemId]} distributors={distributors} staffList={staffList} onUpdate={onUpdate} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== INVENTORY ============================== */
function InventoryView({ items, checks, shipments, transfers }) {
  const qtyItems = items.filter((i) => i.type === "Quantity");
  const [search, setSearch] = useState("");
  const filtered = qtyItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Inventory snapshot</h1>
        <p className="view-sub">Live stock for your {qtyItems.length} quantity-tracked items \u2014 last count plus anything received since.</p>
      </div>
      <div className="panel">
        <input className="text-input" placeholder="Search items\u2026" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="inv-table">
          <div className="inv-head">
            <span>Item</span><span>Threshold</span>
            {LOCATIONS.map((l) => <span key={l}>{l}</span>)}
            <span>Total</span><span>Status</span>
          </div>
          {filtered.map((item) => {
            const stocks = LOCATIONS.map((loc) => liveStock(item, loc, checks, shipments, transfers));
            const total = stocks.reduce((a, b) => a + b, 0);
            const status = invStatus(item, total);
            return (
              <div className="inv-row" key={item.id}>
                <span className="inv-name">{item.name}</span>
                <span className="muted">{item.threshold}</span>
                {stocks.map((s, i) => <span key={i}>{s}</span>)}
                <span><strong>{total}</strong></span>
                <span><Badge status={status} small /></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================== TRANSFERS ============================== */
function TransfersView({ items, transfers, staffList, onUpdate }) {
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const [filter, setFilter] = useState("Pending");

  const filtered = transfers
    .filter((t) => filter === "All" || t.status === filter)
    .sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Transfers between locations</h1>
        <p className="view-sub">
          When a shipment lands at one location but part of it belongs elsewhere, it shows up here until
          someone confirms it actually made the move \u2014 that location's inventory only counts it once you do.
        </p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>{filter === "Pending" ? "Awaiting transfer" : filter}</h2>
          <div className="filter-chips">
            {["Pending", "Received", "All"].map((f) => (
              <button key={f} className={"chip" + (filter === f ? " chip-active" : "")} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">Nothing here right now.</div>
        ) : (
          <div className="queue-list">
            {filtered.map((t) => {
              const item = itemById[t.itemId];
              return (
                <div className="queue-row" key={t.id}>
                  <div className="queue-main">
                    <div className="flag-name">{item ? item.name : t.itemId}</div>
                    <div className="flag-meta">{t.fromLocation} \u2192 {t.toLocation} \u00b7 qty {t.qty} \u00b7 logged {fmtDate(t.dateCreated)}</div>
                    {t.status === "Received" && <div className="flag-meta" style={{ color: "var(--good)" }}>Received at {t.toLocation} {fmtDate(t.dateReceived)}{t.receivedBy ? " by " + t.receivedBy : ""}</div>}
                  </div>
                  {t.status === "Pending" ? (
                    <div className="queue-fields">
                      <Select value={t.receivedBy} onChange={(v) => onUpdate(t.id, { receivedBy: v })} options={staffList} placeholder="Received by" />
                      <button className="btn btn-primary btn-tiny" onClick={() => onUpdate(t.id, { status: "Received", dateReceived: todayISO() })}>
                        Confirm arrived at {t.toLocation}
                      </button>
                    </div>
                  ) : (
                    <Badge status="OK" small />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== HEADER & DRAWER ============================== */
function Header({ onMenuClick }) {
  return (
    <div className="brand-header">
      <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
      <img src={LOGO_SRC} alt="Mann Orthodontics" className="brand-logo" />
      <div className="brand-text">
        <div className="brand-name">Mann Orthodontics</div>
        <div className="brand-tag">Supply System</div>
      </div>
    </div>
  );
}

function SideDrawer({ open, view, setView, onClose, pendingTransfers }) {
  const items = [
    { key: "inventory", label: "Inventory", icon: "\u2261" },
    { key: "transfers", label: "Transfers between locations", icon: "\u21c4", count: pendingTransfers },
    { key: "items", label: "Manage items", icon: "\u25a6" },
    { key: "lists", label: "Staff and distributors", icon: "\u263a" },
  ];
  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} />}
      <div className={"side-drawer" + (open ? " open" : "")}>
        <div className="drawer-section-label">More</div>
        {items.map((it) => (
          <button
            key={it.key}
            className={"drawer-link" + (view === it.key ? " drawer-link-active" : "")}
            onClick={() => { setView(it.key); onClose(); }}
          >
            <span className="drawer-icon">{it.icon}</span>
            {it.label}
            {!!it.count && <span className="drawer-badge">{it.count}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/* ============================== STAFF & DISTRIBUTORS ============================== */
function NameManager({ title, names, onAdd, onRemove }) {
  const [value, setValue] = useState("");
  return (
    <div className="panel">
      <div className="panel-header"><h2>{title}</h2><span className="pill">{names.length}</span></div>
      <div className="name-add-row">
        <input className="text-input" placeholder={"Add a " + title.toLowerCase().replace(/s$/, "") + "\u2026"}
          value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); } }} />
        <button className="btn btn-accent btn-tiny" disabled={!value.trim()} onClick={() => { onAdd(value.trim()); setValue(""); }}>Add</button>
      </div>
      <div className="name-list">
        {names.map((n) => (
          <div className="name-row" key={n}>
            <span>{n}</span>
            <button className="name-remove" onClick={() => onRemove(n)} aria-label={"Remove " + n}>\u00d7</button>
          </div>
        ))}
        {names.length === 0 && <div className="empty-state">None added yet.</div>}
      </div>
    </div>
  );
}

function StaffDistributors({ staff, distributors, onAddStaff, onRemoveStaff, onAddDistributor, onRemoveDistributor }) {
  return (
    <div className="view">
      <div className="view-header">
        <h1>Staff and distributors</h1>
        <p className="view-sub">Removing someone only affects future dropdowns \u2014 past check-ins and shipments keep their original names.</p>
      </div>
      <NameManager title="Staff" names={staff} onAdd={onAddStaff} onRemove={onRemoveStaff} />
      <NameManager title="Distributors" names={distributors} onAdd={onAddDistributor} onRemove={onRemoveDistributor} />
    </div>
  );
}

/* ============================== MANAGE ITEMS ============================== */
function CabinetInputs({ cabinets, onChange }) {
  return (
    <div className="form-row">
      {LOCATIONS.map((loc) => (
        <div className="form-field" key={loc}>
          <label>{loc} cabinet</label>
          <input className="text-input" value={cabinets[loc] || ""} onChange={(e) => onChange({ ...cabinets, [loc]: e.target.value })} placeholder="e.g. 3" />
        </div>
      ))}
    </div>
  );
}

function AddItemForm({ onAdd }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cabinets, setCabinets] = useState({ Tampa: "", Palmetto: "", "St. Pete": "", Largo: "" });
  const [sameCabinet, setSameCabinet] = useState(true);
  const [type, setType] = useState("Good/Low");
  const [unit, setUnit] = useState("");
  const [threshold, setThreshold] = useState("");
  const [qty, setQty] = useState({ tampa: "", palmetto: "", stpete: "", largo: "" });
  const [open, setOpen] = useState(false);

  const reset = () => {
    setName(""); setDesc(""); setCabinets({ Tampa: "", Palmetto: "", "St. Pete": "", Largo: "" });
    setSameCabinet(true); setType("Good/Low"); setUnit(""); setThreshold("");
    setQty({ tampa: "", palmetto: "", stpete: "", largo: "" });
  };

  if (!open) {
    return <button className="btn btn-accent" onClick={() => setOpen(true)}>+ Add new item</button>;
  }

  return (
    <div className="add-item-form">
      <div className="form-row">
        <div className="form-field form-field-wide">
          <label>Item name</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Color Ties" />
        </div>
        <div className="form-field form-field-wide">
          <label>Description / variant</label>
          <input className="text-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Clear" />
        </div>
      </div>

      <div className="form-row">
        <label className="checkbox-line">
          <input type="checkbox" checked={sameCabinet} onChange={(e) => {
            setSameCabinet(e.target.checked);
            if (e.target.checked) {
              const v = cabinets.Tampa;
              setCabinets({ Tampa: v, Palmetto: v, "St. Pete": v, Largo: v });
            }
          }} />
          Same cabinet number at every location
        </label>
      </div>

      {sameCabinet ? (
        <div className="form-row">
          <div className="form-field">
            <label>Cabinet (all locations)</label>
            <input className="text-input" value={cabinets.Tampa}
              onChange={(e) => { const v = e.target.value; setCabinets({ Tampa: v, Palmetto: v, "St. Pete": v, Largo: v }); }}
              placeholder="e.g. 3" />
          </div>
        </div>
      ) : (
        <CabinetInputs cabinets={cabinets} onChange={setCabinets} />
      )}

      <div className="form-row">
        <div className="form-field">
          <label>Tracking type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Good/Low">Good / Low / Need to Order</option>
            <option value="Quantity">Exact quantity count</option>
          </select>
        </div>
        {type === "Quantity" && (
          <>
            <div className="form-field">
              <label>Reorder threshold</label>
              <input className="text-input" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="form-field">
              <label>Unit (optional)</label>
              <input className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. per pack" />
            </div>
          </>
        )}
      </div>

      {type === "Quantity" && (
        <div className="form-row">
          <div className="form-field-note">Starting count on hand right now (optional \u2014 leave blank to check in later)</div>
        </div>
      )}
      {type === "Quantity" && (
        <div className="form-row">
          {LOCATIONS.map((loc) => {
            const field = LOC_FIELD[loc];
            return (
              <div className="form-field" key={loc}>
                <label>{loc} qty</label>
                <input className="text-input" type="number" value={qty[field]} onChange={(e) => setQty({ ...qty, [field]: e.target.value })} />
              </div>
            );
          })}
        </div>
      )}

      <div className="form-row">
        <button className="btn btn-primary" disabled={!name}
          onClick={() => {
            onAdd(
              { name: desc ? name + " - " + desc : name, item: name, desc, cabinets, type,
                unit, threshold: type === "Quantity" ? Number(threshold) || 0 : null, thresholdDesc: "" },
              type === "Quantity" ? qty : null
            );
            reset(); setOpen(false);
          }}>
          Add item
        </button>
        <button className="btn btn-secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

function ManageItems({ items, onAdd, onUpdate, onDelete }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="view">
      <div className="view-header">
        <h1>Manage items</h1>
        <p className="view-sub">Add new supplies, set a different cabinet per location, switch tracking type, or remove items you no longer stock.</p>
      </div>

      <div className="panel">
        <AddItemForm onAdd={onAdd} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>All items</h2>
          <span className="pill">{items.length} total</span>
        </div>
        <input className="text-input" placeholder="Search items\u2026" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="manage-list">
          {filtered.map((item) => (
            <div className="manage-row" key={item.id}>
              {editingId === item.id ? (
                <EditItemInline item={item} onSave={(patch) => { onUpdate(item.id, patch); setEditingId(null); }} onCancel={() => setEditingId(null)} />
              ) : (
                <>
                  <div className="manage-main">
                    <div className="flag-name">{item.name}</div>
                    <div className="flag-meta">
                      {LOCATIONS.map((loc) => loc + " Cab " + (item.cabinets[loc] || "\u2014")).join("  \u00b7  ")}
                    </div>
                    <div className="flag-meta muted">
                      {item.type === "Quantity" ? "Exact qty \u00b7 threshold " + item.threshold : "Good / Low"}
                    </div>
                  </div>
                  <div className="manage-actions">
                    <button className="btn btn-secondary btn-tiny" onClick={() => setEditingId(item.id)}>Edit</button>
                    {confirmDeleteId === item.id ? (
                      <>
                        <button className="btn btn-danger btn-tiny" onClick={() => { onDelete(item.id); setConfirmDeleteId(null); }}>Confirm delete</button>
                        <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-secondary btn-tiny" onClick={() => setConfirmDeleteId(item.id)}>Delete</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state">No items match that search.</div>}
        </div>
      </div>
    </div>
  );
}

function EditItemInline({ item, onSave, onCancel }) {
  const [type, setType] = useState(item.type);
  const [threshold, setThreshold] = useState(item.threshold ?? "");
  const [unit, setUnit] = useState(item.unit || "");
  const [cabinets, setCabinets] = useState({ ...item.cabinets });

  return (
    <div className="edit-inline">
      <CabinetInputs cabinets={cabinets} onChange={setCabinets} />
      <div className="form-row">
        <div className="form-field">
          <label>Tracking type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Good/Low">Good / Low / Need to Order</option>
            <option value="Quantity">Exact quantity count</option>
          </select>
        </div>
        {type === "Quantity" && (
          <>
            <div className="form-field">
              <label>Reorder threshold</label>
              <input className="text-input" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Unit</label>
              <input className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="form-row">
        <button className="btn btn-primary btn-tiny" onClick={() => onSave({ type, cabinets, threshold: type === "Quantity" ? Number(threshold) || 0 : null, unit })}>Save</button>
        <button className="btn btn-secondary btn-tiny" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ============================== APP SHELL ============================== */
export default function App() {
  const [items, saveItems, itemsLoaded] = useSharedState("items", null);
  const [checks, saveChecks, checksLoaded] = useSharedState("checks", {});
  const [shipments, saveShipments, shipLoaded] = useSharedState("shipments", []);
  const [transfers, saveTransfers, transfersLoaded] = useSharedState("transfers", []);
  const [queue, saveQueue, queueLoaded] = useSharedState("queue", []);
  const [lists, saveLists, listsLoaded] = useSharedState("lists", { staff: SEED_STAFF, distributors: SEED_DISTRIBUTORS });

  const [view, setView] = useState("dashboard");
  const [activeLocation, setActiveLocation] = useState("Tampa");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const ready = itemsLoaded && checksLoaded && shipLoaded && transfersLoaded && queueLoaded && listsLoaded;

  useEffect(() => {
    if (itemsLoaded && items === null) {
      saveItems(SEED_ITEMS);
    }
  }, [itemsLoaded, items, saveItems]);

  const itemList = items || SEED_ITEMS;

  const handleSaveCheck = useCallback((item, location, patch) => {
    const key = keyFor(location, item.id);
    const nextCheck = { ...(checks[key] || {}), ...patch, date: todayISO() };
    const nextChecks = { ...checks, [key]: nextCheck };
    saveChecks(nextChecks);

    const status = effectiveStatus(item, nextCheck);
    if (status === "Need to Order") {
      const detail = {
        qty: item.type === "Quantity" ? nextCheck.count : null,
        reason: item.type === "Quantity"
          ? "Counted " + nextCheck.count + " (threshold " + item.threshold + ")"
          : "Marked Need to Order on location check",
        staff: nextCheck.staff || "",
      };
      saveQueue(upsertQueueEntry(queue, item.id, location, detail));
    }
  }, [checks, queue, saveChecks, saveQueue]);

  const handleAddShipment = useCallback((shipment) => {
    saveShipments([...shipments, shipment]);
  }, [shipments, saveShipments]);

  // Updating a shipment can also spin off internal transfers: once status becomes
  // "Received", the ship-to location gets its own portion credited immediately, and
  // every OTHER location with a nonzero share gets a pending transfer record instead
  // of being credited right away - it isn't really there until someone moves it and
  // confirms it arrived.
  const handleUpdateShipment = useCallback((id, patch) => {
    let createdTransfers = [];
    const nextShipments = shipments.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if (next.status === "Received" && !next.transfersCreated) {
        const shipTo = next.shipTo || "";
        LOCATIONS.forEach((loc) => {
          const field = LOC_FIELD[loc];
          const qty = Number(next[field]) || 0;
          if (qty > 0 && shipTo && loc !== shipTo) {
            createdTransfers.push({
              id: uid("TR"), shipmentId: next.id, itemId: next.itemId,
              fromLocation: shipTo, toLocation: loc, qty,
              status: "Pending", dateCreated: todayISO(), dateReceived: "", receivedBy: "",
            });
          }
        });
        next.transfersCreated = true;
      }
      return next;
    });
    saveShipments(nextShipments);
    if (createdTransfers.length > 0) {
      saveTransfers([...transfers, ...createdTransfers]);
    }
  }, [shipments, transfers, saveShipments, saveTransfers]);

  const handleUpdateTransfer = useCallback((id, patch) => {
    saveTransfers(transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [transfers, saveTransfers]);

  // Updating a queue entry can also auto-create a shipment: the moment status becomes
  // "Ordered" and a distributor + quantity are present, split the quantity across the
  // entry's selected locations (weighted Palmetto > Tampa > St. Pete > Largo) and log
  // it in Shipments - once per queue entry.
  const handleUpdateQueue = useCallback((id, patch) => {
    let newShipment = null;
    const nextQueue = queue.map((q) => {
      if (q.id !== id) return q;
      const next = { ...q, ...patch };
      const ready = next.distributor && Number(next.qtyToOrder) > 0;
      if (next.status === "Ordered" && ready && !next.shipmentCreated) {
        const total = Number(next.qtyToOrder);
        const locs = next.locations && next.locations.length ? next.locations : LOCATIONS;
        const splitByLoc = weightedSplit(total, locs);
        newShipment = {
          id: uid("SHP"), itemId: next.itemId, distributor: next.distributor, po: "", shipTo: "",
          dateOrdered: todayISO(), status: "Ordered", total,
          tampa: splitByLoc["Tampa"] || 0, palmetto: splitByLoc["Palmetto"] || 0,
          stpete: splitByLoc["St. Pete"] || 0, largo: splitByLoc["Largo"] || 0,
          dateReceived: "", receivedBy: "", transfersCreated: false,
          notes: "Auto-created from ordering queue (" + locs.join(", ") + ")",
        };
        next.shipmentCreated = true;
        next.dateOrdered = next.dateOrdered || todayISO();
      }
      return next;
    });
    saveQueue(nextQueue);
    if (newShipment) {
      saveShipments([...shipments, newShipment]);
    }
  }, [queue, shipments, saveQueue, saveShipments]);

  const handleManualQueueAdd = useCallback((itemId, locationsToAdd) => {
    let nextQueue = queue;
    locationsToAdd.forEach((loc) => {
      nextQueue = upsertQueueEntry(nextQueue, itemId, loc, { qty: null, reason: "Manually added to queue", staff: "" });
    });
    saveQueue(nextQueue);
    return true;
  }, [queue, saveQueue]);

  const handleAddItem = useCallback((itemData, initialQty) => {
    const newItem = { id: uid("SUP-C"), ...itemData };
    const nextItems = [...itemList, newItem];
    saveItems(nextItems);

    if (initialQty) {
      const nextChecks = { ...checks };
      LOCATIONS.forEach((loc) => {
        const field = LOC_FIELD[loc];
        if (initialQty[field] !== "" && initialQty[field] !== undefined) {
          nextChecks[keyFor(loc, newItem.id)] = { count: Number(initialQty[field]), date: todayISO(), staff: "", notes: "" };
        }
      });
      saveChecks(nextChecks);
    }
  }, [itemList, checks, saveItems, saveChecks]);

  const handleUpdateItem = useCallback((id, patch) => {
    saveItems(itemList.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, [itemList, saveItems]);

  const handleDeleteItem = useCallback((id) => {
    saveItems(itemList.filter((i) => i.id !== id));
  }, [itemList, saveItems]);

  const handleAddStaff = useCallback((name) => {
    if (!name || lists.staff.includes(name)) return;
    saveLists({ ...lists, staff: [...lists.staff, name] });
  }, [lists, saveLists]);

  const handleRemoveStaff = useCallback((name) => {
    saveLists({ ...lists, staff: lists.staff.filter((s) => s !== name) });
  }, [lists, saveLists]);

  const handleAddDistributor = useCallback((name) => {
    if (!name || lists.distributors.includes(name)) return;
    saveLists({ ...lists, distributors: [...lists.distributors, name] });
  }, [lists, saveLists]);

  const handleRemoveDistributor = useCallback((name) => {
    saveLists({ ...lists, distributors: lists.distributors.filter((d) => d !== name) });
  }, [lists, saveLists]);

  const locCounts = useMemo(() => {
    const c = {};
    LOCATIONS.forEach((loc) => {
      let n = 0;
      itemList.forEach((item) => {
        if (item.type === "Quantity") {
          const stock = liveStock(item, loc, checks, shipments, transfers);
          if (invStatus(item, stock) === "REORDER NOW") n++;
        } else {
          const st = effectiveStatus(item, checks[keyFor(loc, item.id)]);
          if (st === "Need to Order") n++;
        }
      });
      c[loc] = n;
    });
    return c;
  }, [itemList, checks, shipments, transfers]);

  const totalFlagged = Object.values(locCounts).reduce((a, b) => a + b, 0);
  const pendingQueue = queue.filter((q) => q.status === "Pending").length;
  const pendingTransfers = transfers.filter((t) => t.status === "Pending").length;

  if (!ready) {
    return (
      <div className="app-loading">
        <style>{STYLES}</style>
        <img src={LOGO_SRC} alt="" className="loading-logo" />
        <div className="spinner" />
        <div>Loading supply data\u2026</div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <style>{STYLES}</style>
      <Header onMenuClick={() => setDrawerOpen(true)} />

      <div className="app-shell">
        <SideDrawer open={drawerOpen} view={view} setView={setView} onClose={() => setDrawerOpen(false)} pendingTransfers={pendingTransfers} />

        <main className="main-panel">
          {view === "dashboard" && (
            <Dashboard items={itemList} checks={checks} shipments={shipments} transfers={transfers} queue={queue} setView={setView} setActiveLocation={setActiveLocation} />
          )}
          {view === "checkin" && (
            <CheckIn items={itemList} checks={checks} activeLocation={activeLocation} setActiveLocation={setActiveLocation}
              staffList={lists.staff} onSaveCheck={handleSaveCheck} locCounts={locCounts} />
          )}
          {view === "shipments" && (
            <ShipmentsView items={itemList} shipments={shipments} distributors={lists.distributors} staffList={lists.staff}
              onAdd={handleAddShipment} onUpdate={handleUpdateShipment} />
          )}
          {view === "queue" && (
            <QueueView items={itemList} queue={queue} distributors={lists.distributors} staffList={lists.staff}
              onUpdate={handleUpdateQueue} onManualAdd={handleManualQueueAdd} />
          )}
          {view === "inventory" && (
            <InventoryView items={itemList} checks={checks} shipments={shipments} transfers={transfers} />
          )}
          {view === "items" && (
            <ManageItems items={itemList} onAdd={handleAddItem} onUpdate={handleUpdateItem} onDelete={handleDeleteItem} />
          )}
          {view === "lists" && (
            <StaffDistributors staff={lists.staff} distributors={lists.distributors}
              onAddStaff={handleAddStaff} onRemoveStaff={handleRemoveStaff}
              onAddDistributor={handleAddDistributor} onRemoveDistributor={handleRemoveDistributor} />
          )}
          {view === "transfers" && (
            <TransfersView items={itemList} transfers={transfers} staffList={lists.staff} onUpdate={handleUpdateTransfer} />
          )}
        </main>
      </div>

      <nav className="bottom-nav">
        <NavItem icon="\u2302" label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} count={totalFlagged} />
        <NavItem icon="\u2713" label="Check-in" active={view === "checkin"} onClick={() => setView("checkin")} />
        <NavItem icon="\u25a2" label="Shipments" active={view === "shipments"} onClick={() => setView("shipments")} />
        <NavItem icon="\u2691" label="Queue" active={view === "queue"} onClick={() => setView("queue")} count={pendingQueue} />
      </nav>
    </div>
  );
}

/* ============================== STYLES ============================== */
const STYLES = `
:root {
  --ink: #15409E;
  --ink-2: #1B4FC4;
  --ink-soft: #66738F;
  --paper: #F5F7FA;
  --card: #FFFFFF;
  --line: #E1E6EE;
  --brand-green: #6FA030;
  --brand-green-dark: #5C8827;
  --good: #4C8A3F;
  --good-bg: #E9F2E2;
  --low: #B0762A;
  --low-bg: #FBF0DC;
  --reorder: #C0392B;
  --reorder-bg: #FBE6E3;
}

* { box-sizing: border-box; }

.app-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--paper);
  color: var(--ink);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: 72px;
}

.app-loading {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--ink-soft); background: var(--paper);
}
.spinner { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.app-body { flex: 1; }
.main-panel { max-width: 880px; margin: 0 auto; padding: 20px 16px 40px; }

.view-header { margin-bottom: 18px; }
.view-header h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
.view-sub { font-size: 13px; color: var(--ink-soft); margin: 0; }

.card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
@media (min-width: 640px) { .card-grid { grid-template-columns: repeat(4, 1fr); } }

.loc-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px;
  text-align: left; cursor: pointer; transition: box-shadow 0.15s, transform 0.15s;
}
.loc-card:hover { box-shadow: 0 4px 14px rgba(27,58,87,0.08); transform: translateY(-1px); }
.loc-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.loc-card-name { font-weight: 600; font-size: 13px; color: var(--ink); }
.loc-card-dot { width: 8px; height: 8px; border-radius: 50%; }
.loc-card-count { font-size: 26px; font-weight: 700; font-family: ui-monospace, "SF Mono", Menlo, monospace; line-height: 1; }
.loc-card-label { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }

.panel { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-header h2 { font-size: 15px; font-weight: 600; margin: 0; }
.pill { font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 100px; padding: 3px 10px; color: var(--ink-soft); font-weight: 600; }

.empty-state { color: var(--ink-soft); font-size: 13px; padding: 20px 4px; text-align: center; }

.flag-list { display: flex; flex-direction: column; gap: 1px; }
.flag-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.flag-row:last-child { border-bottom: none; }
.flag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.flag-main { flex: 1; min-width: 0; }
.flag-name { font-size: 13px; font-weight: 600; }
.flag-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; }
.muted { color: var(--ink-soft); }

.badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; letter-spacing: 0.01em; }
.badge-sm { font-size: 10.5px; padding: 2px 8px; }
.badge-empty { background: var(--line); color: var(--ink-soft); }

.btn { border: none; border-radius: 9px; font-weight: 600; cursor: pointer; font-size: 13px; padding: 9px 16px; transition: opacity 0.15s; font-family: inherit; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--ink); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
.btn-tiny { padding: 5px 10px; font-size: 11.5px; background: var(--ink); color: #fff; border-radius: 7px; }

/* Drawer tabs - signature element for location switching */
.drawer-tabs { display: flex; gap: 4px; padding: 0 2px; }
.drawer-tab {
  position: relative; flex: 1; background: #EDEAE0; border: 1px solid var(--line); border-bottom: none;
  border-radius: 10px 10px 0 0; padding: 10px 8px 12px; cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s;
}
.drawer-tab:hover { background: #F1EEE4; }
.drawer-tab-active { background: var(--card); box-shadow: 0 -3px 10px rgba(27,58,87,0.06); z-index: 1; }
.drawer-tab-label { font-size: 12.5px; font-weight: 700; color: var(--ink); }
.drawer-tab-badge { background: var(--reorder); color: #fff; font-size: 10px; font-weight: 700; border-radius: 100px; padding: 1px 6px; min-width: 16px; text-align: center; }
.drawer-panel { border-top-left-radius: 0; margin-top: -1px; }

.checkin-controls { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.select, .text-input { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; background: var(--card); color: var(--ink); font-family: inherit; }
.select { min-width: 130px; }
.text-input { flex: 1; min-width: 140px; }

.cabinet-group { margin-bottom: 14px; }
.cabinet-label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 6px 2px; }

.item-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.item-row:last-child { border-bottom: none; }
.item-main { flex: 1; min-width: 160px; }
.item-name { font-size: 13px; font-weight: 600; }
.item-meta { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }

.qty-input { width: 70px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; font-size: 13px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.status-toggle { display: flex; gap: 5px; }
.toggle-btn { border: 1px solid var(--line); background: var(--paper); border-radius: 7px; padding: 6px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer; color: var(--ink-soft); font-family: inherit; }
.toggle-btn-active { font-weight: 700; }

.ship-form { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; gap: 10px; flex-wrap: wrap; }
.form-field { flex: 1; min-width: 110px; position: relative; }
.form-field-wide { flex: 2; min-width: 220px; }
.form-field label { display: block; font-size: 11px; font-weight: 600; color: var(--ink-soft); margin-bottom: 4px; }
.form-field .text-input, .form-field .select { width: 100%; }

.autocomplete { position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-top: 4px; max-height: 220px; overflow-y: auto; z-index: 10; box-shadow: 0 6px 20px rgba(27,58,87,0.12); }
.autocomplete-item { padding: 8px 10px; font-size: 12.5px; cursor: pointer; border-bottom: 1px solid var(--line); }
.autocomplete-item:hover { background: var(--paper); }
.autocomplete-item:last-child { border-bottom: none; }

.warn-line { font-size: 12px; color: var(--low); background: var(--low-bg); padding: 8px 10px; border-radius: 8px; }

.filter-chips { display: flex; gap: 6px; }
.chip { border: 1px solid var(--line); background: var(--paper); border-radius: 100px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit; }
.chip-active { background: var(--ink); color: #fff; border-color: var(--ink); }

.ship-list, .queue-list { display: flex; flex-direction: column; }
.ship-row, .queue-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.ship-row:last-child, .queue-row:last-child { border-bottom: none; }
.ship-main, .queue-main { flex: 1; min-width: 200px; }
.ship-actions { display: flex; align-items: center; gap: 8px; }
.queue-fields { display: flex; gap: 6px; flex-wrap: wrap; }

.inv-table { display: flex; flex-direction: column; font-size: 12px; }
.inv-head, .inv-row { display: grid; grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr 1fr; gap: 6px; align-items: center; padding: 8px 4px; }
.inv-head { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid var(--line); }
.inv-row { border-bottom: 1px solid var(--line); }
.inv-name { font-weight: 600; font-size: 12px; }

.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--line);
  display: flex; justify-content: space-around; padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
  z-index: 20;
}
.nav-item { flex: 1; background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; cursor: pointer; color: var(--ink-soft); font-family: inherit; position: relative; }
.nav-item-active { color: var(--ink); }
.nav-icon { font-size: 17px; line-height: 1; }
.nav-label { font-size: 9.5px; font-weight: 600; }
.nav-count { position: absolute; top: 2px; right: 18%; background: var(--reorder); color: #fff; font-size: 9px; font-weight: 700; border-radius: 100px; min-width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; padding: 0 3px; }

@media (min-width: 640px) {
  .main-panel { padding: 32px 24px 40px; }
}


/* Brand header */
.brand-header {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--card); border-bottom: 2px solid var(--brand-green);
}
.brand-logo { height: 34px; width: 34px; object-fit: contain; }
.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.brand-name { font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.brand-tag { font-size: 10.5px; font-weight: 700; color: var(--brand-green-dark); text-transform: uppercase; letter-spacing: 0.06em; }

.loading-logo { height: 48px; width: 48px; object-fit: contain; margin-bottom: 4px; }

.btn-accent { background: var(--brand-green); color: #fff; }
.btn-accent:hover:not(:disabled) { background: var(--brand-green-dark); }
.btn-danger { background: var(--reorder-bg); color: var(--reorder); border: 1px solid var(--reorder); }

.add-item-form { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.form-field-note { font-size: 11.5px; color: var(--ink-soft); font-style: italic; }

.manage-list { display: flex; flex-direction: column; }
.manage-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 4px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.manage-row:last-child { border-bottom: none; }
.manage-main { flex: 1; min-width: 200px; }
.manage-actions { display: flex; gap: 6px; }
.edit-inline { flex: 1; width: 100%; padding: 8px 0; }

.checkbox-line { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); font-weight: 600; cursor: pointer; }
.checkbox-line input { width: 15px; height: 15px; accent-color: var(--ink); }

.hamburger-btn { background: none; border: none; cursor: pointer; padding: 4px; color: var(--ink); display: flex; }

.app-shell { display: flex; flex: 1; position: relative; }

.side-drawer {
  position: fixed; top: 0; left: -260px; bottom: 0; width: 240px; background: var(--card);
  border-right: 1px solid var(--line); z-index: 30; transition: left 0.2s ease; padding-top: 62px;
  overflow-y: auto;
}
.side-drawer.open { left: 0; box-shadow: 4px 0 20px rgba(27,58,87,0.15); }
.drawer-backdrop { position: fixed; inset: 0; background: rgba(20,30,40,0.32); z-index: 25; }
.drawer-section-label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 18px; }
.drawer-link { display: flex; align-items: center; gap: 10px; padding: 11px 18px; cursor: pointer; color: var(--ink-soft); font-weight: 600; font-size: 13px; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
.drawer-link:hover { background: var(--paper); }
.drawer-link-active { color: var(--ink); background: var(--paper); border-right: 3px solid var(--brand-green); }
.drawer-icon { font-size: 15px; width: 18px; text-align: center; }

@media (min-width: 900px) {
  .side-drawer { position: sticky; left: 0 !important; top: 0; height: 100vh; padding-top: 20px; }
  .drawer-backdrop { display: none; }
  .hamburger-btn { display: none; }
}

.name-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
.name-add-row .text-input { flex: 1; }
.name-list { display: flex; flex-direction: column; }
.name-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
.name-row:last-child { border-bottom: none; }
.name-remove { background: none; border: none; color: var(--ink-soft); font-size: 17px; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.name-remove:hover { background: var(--reorder-bg); color: var(--reorder); }

.qty-order-input { max-width: 100px; }
.queue-notes { width: 100%; margin-top: 8px; resize: vertical; font-family: inherit; }

.queue-row { flex-direction: column; align-items: stretch; }
.queue-row .queue-main { min-width: unset; margin-bottom: 8px; }
.queue-row .queue-fields { margin-bottom: 4px; }

.loc-toggle { display: flex; gap: 5px; flex-wrap: wrap; }
.loc-chip { border: 1px solid var(--line); background: var(--paper); border-radius: 100px; padding: 4px 11px; font-size: 11px; font-weight: 600; color: var(--ink-soft); cursor: pointer; font-family: inherit; }
.loc-chip-active { background: var(--ink); color: #fff; border-color: var(--ink); }
.loc-chip-all { border-style: dashed; }
.loc-chip-all.loc-chip-active { background: var(--brand-green); border-color: var(--brand-green); border-style: solid; color: #fff; }

.drawer-badge { margin-left: auto; background: var(--reorder); color: #fff; font-size: 10px; font-weight: 700; border-radius: 100px; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; padding: 0 5px; }
`;
