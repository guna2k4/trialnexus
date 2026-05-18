import csv
import random

NUM_SITES = 100
FILENAME = 'clinical_trial_crm_data.csv'

states = ["TX", "NY", "CA", "FL", "IL", "PA", "OH", "GA", "NC", "MI", "WA", "MA"]

negative_complaints = [
    "Doctors complain the inclusion criteria is too strict.",
    "Patients are dropping out due to long travel distances to the site.",
    "Patients fear the potential side effects mentioned in the consent form.",
    "Site lacks sufficient staff to process the paperwork.",
    "Competitor trial in the same hospital is poaching eligible patients."
]
positive_notes = [
    "Enrollment is on track. Site staff is highly motivated.",
    "Doctors find the protocol easy to follow and are referring patients.",
    "Excellent patient retention this month. No major issues."
]

print(f"Generating {NUM_SITES} mock clinical site records...")

with open(FILENAME, mode='w', newline='', encoding='utf-8') as file:
    writer = csv.writer(file)
    writer.writerow(["site_id", "state", "target_enrollment", "actual_enrollment", "dropout_rate_percentage", "field_notes"])

    for i in range(1, NUM_SITES + 1):
        site_id = f"SITE_{str(i).zfill(3)}"
        state = random.choice(states)
        is_failing = random.random() < 0.4

        target_enrollment = random.randint(50, 150)

        if is_failing:
            actual_enrollment = int(target_enrollment * random.uniform(0.3, 0.6))
            dropout_rate = random.randint(25, 45)
            notes = random.choice(negative_complaints)
        else:
            actual_enrollment = int(target_enrollment * random.uniform(0.85, 1.05))
            dropout_rate = random.randint(5, 15)
            notes = random.choice(positive_notes)

        writer.writerow([site_id, state, target_enrollment, actual_enrollment, dropout_rate, notes])

print(f"Success! Data saved to {FILENAME}")
