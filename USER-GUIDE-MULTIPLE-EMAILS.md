# 📧 User Guide: Multiple Emails Per Row

## Quick Start

Upload CSV files with **multiple email addresses in one row** by separating them with commas.

---

## ✅ Valid Format

### Example CSV:
```csv
Email,Name,Company,Role
john@company.com,John Smith,Acme Corp,Manager
mary@company.com, bob@company.com,Team Leads,Tech Inc,Leadership
sales@startup.com, support@startup.com, info@startup.com,Contact Team,Startup XYZ,General
```

### What Happens:
1. **Row 1**: 1 email → 1 recipient
2. **Row 2**: 2 emails → 2 recipients (both get "Team Leads" as name)
3. **Row 3**: 3 emails → 3 recipients (all get "Contact Team" as name)

**Total Recipients**: 6 emails will be sent

---

## 📋 Rules

### ✅ DO:
- Use commas to separate emails: `email1@domain.com, email2@domain.com`
- Add spaces around commas (optional): `email1@domain.com , email2@domain.com`
- Mix single and multiple emails in the same file
- Use any number of columns for merge variables

### ❌ DON'T:
- Use semicolons: `email1@domain.com; email2@domain.com` ❌
- Use pipes: `email1@domain.com | email2@domain.com` ❌
- Put emails in separate columns ❌
- Forget the comma separator ❌

---

## 🎯 Use Cases

### 1. Team Distribution Lists
```csv
Email,Department,Manager
sales-team@company.com, sales-lead@company.com,Sales,John Smith
```
**Result**: Both sales team and lead receive the email

### 2. Primary + Backup Contacts
```csv
Email,Company,ContactType
ceo@startup.com, assistant@startup.com,Tech Startup,Executive Office
```
**Result**: CEO and assistant both receive the communication

### 3. Multiple Decision Makers
```csv
Email,Project,Priority
pm@client.com, tech-lead@client.com, stakeholder@client.com,Website Redesign,High
```
**Result**: All three decision makers receive project updates

### 4. Family/Group Contacts
```csv
Email,Family,EventDate
parent1@email.com, parent2@email.com,Smith Family,2024-06-15
```
**Result**: Both parents receive event invitations

---

## 👀 What You'll See in Preview

### Stats Dashboard:
```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 157              │ │ 189              │ │ 7                │
│ TOTAL ROWS       │ │ VALID EMAILS     │ │ DUPLICATES       │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Note**: "Total Rows" = CSV rows, "Valid Emails" = actual recipients (may be more!)

### Information Alert:
```
┌──────────────────────────────────────────────────────────┐
│ 📊 Multiple emails detected in some rows                 │
│ Each email is validated separately and sent individually │
└──────────────────────────────────────────────────────────┘
```

### Preview Table:
```
┌───┬────────────────────────────────┬──────────┬─────────────┐
│ # │ Email                          │ Name     │ Status      │
├───┼────────────────────────────────┼──────────┼─────────────┤
│ 1 │ mary@company.com [MULTI] 🔵    │ Team     │ ✅ Valid    │
│ 2 │ bob@company.com [MULTI] 🔵     │ Team     │ ✅ Valid    │
└───┴────────────────────────────────┴──────────┴─────────────┘
```

**Badge Meaning**:
- `[MULTI] 🔵` = This email came from a multi-email row

---

## 🔍 Validation

Each email is validated **individually**:

### Example with Mixed Valid/Invalid:
```csv
Email,Name
valid@test.com, invalid-email, another@test.com,John Smith
```

**Preview Result**:
| # | Email | Name | Status |
|---|-------|------|--------|
| 1 | valid@test.com | John Smith | ✅ Valid |
| 2 | invalid-email | John Smith | ❌ Invalid email format |
| 3 | another@test.com | John Smith | ✅ Valid |

**Campaign Will Send To**: 2 recipients (valid@test.com and another@test.com)

---

## 🎨 Merge Variables

All emails from the same row **share the same merge variables**:

### Example:
```csv
Email,FirstName,Company,Role
ceo@startup.com, cto@startup.com,Tech,Startup XYZ,Leadership
```

### Email Content:
```
Subject: Hello {{FirstName}}!

Body:
Hi {{FirstName}},

You are in the {{Role}} team at {{Company}}.

Best regards
```

### Result:
- **ceo@startup.com** receives:
  ```
  Subject: Hello Tech!
  Body: You are in the Leadership team at Startup XYZ.
  ```

- **cto@startup.com** receives:
  ```
  Subject: Hello Tech!
  Body: You are in the Leadership team at Startup XYZ.
  ```

**Note**: Both emails get **identical content** because they share the same row data.

---

## 💡 Tips & Best Practices

### ✅ Best Practices:
1. **Use descriptive names** for multi-email rows:
   - Good: "Leadership Team"
   - Bad: "John" (when emailing to 3 people)

2. **Review the preview** before sending:
   - Check for `[MULTI]` badges
   - Verify email count matches expectations

3. **Test with small file first**:
   - Upload 5-10 rows to understand the behavior
   - Check stats: does "Valid Emails" > "Total Rows"?

4. **Use for related contacts**:
   - ✅ Team members in same department
   - ✅ Decision makers on same project
   - ❌ Unrelated individuals (use separate rows)

### ⚠️ Common Mistakes:

**Mistake 1**: Using semicolons
```csv
❌ email1@test.com; email2@test.com
✅ email1@test.com, email2@test.com
```

**Mistake 2**: Putting emails in different columns
```csv
❌ Email1,Email2,Name
   john@test.com,mary@test.com,Team

✅ Email,Name
   john@test.com, mary@test.com,Team
```

**Mistake 3**: Missing commas
```csv
❌ john@test.com mary@test.com  (space without comma)
✅ john@test.com, mary@test.com
```

---

## 📊 Example Files

### Simple Multi-Email CSV:
```csv
Email,Name,Company
john@acme.com,John Smith,Acme Corp
mary@tech.com, bob@tech.com,Tech Team,Tech Inc
sales@startup.com, support@startup.com, info@startup.com,Contact,Startup XYZ
```

**Expected Stats**:
- Total Rows: 3
- Valid Emails: 6
- Invalid: 0

### Complex Multi-Email CSV:
```csv
Email,FirstName,LastName,Company,Department,Role
ceo@company.com,Jane,Doe,Company A,Executive,CEO
pm@client.com, dev-lead@client.com,Tech,Team,Client B,Engineering,Leadership
john@test.com, invalid-email, mary@test.com,Sales,Team,Test Corp,Sales,Reps
```

**Expected Stats**:
- Total Rows: 3
- Valid Emails: 5 (ceo, pm, dev-lead, john, mary)
- Invalid: 1 (invalid-email)

---

## 🔔 What You'll Be Notified About

### 1. **File Upload Success**
```
✅ Found 189 valid recipients!
```

### 2. **Validation Issues**
```
⚠️ 2 invalid emails found - check the preview
```

### 3. **Duplicates Detected**
```
⚠️ 7 duplicate emails detected
Duplicates are skipped — each address is sent to once (case and spaces are ignored).
The server applies the same rule when you click Send, so the preview count is what goes out.
```

### 4. **Multi-Email Rows Detected**
```
ℹ️ Multiple emails detected in some rows
Each email is validated separately
```

---

## ❓ FAQ

### Q: Do all emails from one row get the same message?
**A**: Yes! All emails from the same row share the same merge variables and receive identical content.

### Q: What if one email in a row is invalid?
**A**: Invalid emails are marked with ❌ status and won't receive the campaign. Valid emails from the same row will still be sent to.

### Q: Can I mix single and multiple emails?
**A**: Absolutely! Some rows can have 1 email, others can have 2, 3, or more.

### Q: Is there a limit to emails per row?
**A**: No hard limit, but keep it reasonable (under 10 per row recommended for clarity).

### Q: Will duplicates be sent twice?
**A**: Yes, unless you remove them from your file. The system warns you but doesn't block duplicates.

### Q: How do I know which emails came from multi-email rows?
**A**: Look for the `[MULTI] 🔵` badge next to email addresses in the preview table.

---

## 🚀 Getting Started

1. **Prepare your CSV** with comma-separated emails
2. **Upload the file** in the "Send Campaign" page
3. **Check the preview**:
   - Verify email count
   - Look for `[MULTI]` badges
   - Check for validation errors
4. **Compose your email** with merge variables
5. **Send or schedule** your campaign!

---

## 📞 Support

If you encounter issues:
- Check that emails are comma-separated (not semicolons)
- Verify the Email column header is recognized
- Look for validation error messages in preview
- Check the information alerts for guidance

---

**Feature Status**: ✅ Live  
**Last Updated**: January 2025  
**Version**: 2.0
