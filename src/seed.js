// First-run content: the standard exercise library and the two starting
// routines. After the first run this lives in IndexedDB and is fully editable.

export const MUSCLES = ['Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Cardio'];
export const EQUIPMENT = ['machine', 'cable', 'dumbbell', 'barbell', 'bodyweight', 'cardio'];

// [id, name, muscle, equipment, movement group, cue]
// Exercises in the same movement group are offered as swaps for each other.
const ROWS = [
  // Legs
  ['leg-press', 'Leg Press', 'Legs', 'machine', 'squat', 'Feet shoulder width. Lower until knees reach 90 degrees. Do not lock out at the top.'],
  ['hack-squat', 'Hack Squat', 'Legs', 'machine', 'squat', 'Back flat on the pad. Lower slowly, drive up through the whole foot.'],
  ['smith-squat', 'Smith Machine Squat', 'Legs', 'machine', 'squat', 'Feet slightly forward of the bar. Sit down and back, chest up.'],
  ['goblet-squat', 'Goblet Squat', 'Legs', 'dumbbell', 'squat', 'Hold the dumbbell at your chest. Sit between your hips, elbows inside knees.'],
  ['back-squat', 'Back Squat', 'Legs', 'barbell', 'squat', 'Brace before you descend. Knees track over toes. Thighs to parallel.'],
  ['front-squat', 'Front Squat', 'Legs', 'barbell', 'squat', 'Elbows high, bar on the shoulders. Stay upright all the way down.'],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'Legs', 'dumbbell', 'squat', 'Rear foot on a bench. Drop straight down, front knee over mid-foot.'],
  ['walking-lunge', 'Walking Lunge', 'Legs', 'dumbbell', 'squat', 'Long step, back knee close to the floor, torso tall.'],
  ['step-up', 'Step-Up', 'Legs', 'dumbbell', 'squat', 'Whole foot on the box. Push through the top leg, lower under control.'],
  ['bodyweight-squat', 'Bodyweight Squat', 'Legs', 'bodyweight', 'squat', 'Arms forward for balance. Sit back, heels down, thighs to parallel.'],
  ['leg-extension', 'Leg Extension', 'Legs', 'machine', 'kneeext', 'Pad on the lower shin. Straighten fully, pause, lower slowly.'],
  ['rdl', 'Romanian Deadlift', 'Legs', 'barbell', 'hinge', 'Soft knees, push hips back, bar close to the legs. Stop when your back would round.'],
  ['db-rdl', 'Dumbbell Romanian Deadlift', 'Legs', 'dumbbell', 'hinge', 'Dumbbells slide down the thighs. Hips back, back flat, feel the hamstrings.'],
  ['cable-pull-through', 'Cable Pull-Through', 'Legs', 'cable', 'hinge', 'Face away from the cable. Hinge back, then drive hips forward and squeeze.'],
  ['back-extension', 'Back Extension', 'Back', 'bodyweight', 'hinge', 'Pad below the hips. Lower with a flat back, rise until your body is straight.'],
  ['deadlift', 'Deadlift', 'Legs', 'barbell', 'hinge', 'Bar over mid-foot, back flat, push the floor away. Keep the bar against you.'],
  ['leg-curl', 'Leg Curl', 'Legs', 'machine', 'kneeflex', 'Hips pressed down. Curl all the way, lower over two seconds.'],
  ['seated-leg-curl', 'Seated Leg Curl', 'Legs', 'machine', 'kneeflex', 'Thigh pad snug. Pull heels under the seat, control the return.'],
  ['hip-thrust', 'Hip Thrust', 'Legs', 'barbell', 'glute', 'Upper back on the bench. Drive hips up until level, chin tucked.'],
  ['glute-bridge', 'Glute Bridge', 'Legs', 'bodyweight', 'glute', 'On your back, feet flat. Lift hips, squeeze for a second, lower.'],
  ['hip-abduction', 'Hip Abduction', 'Legs', 'machine', 'abduct', 'Sit tall. Push knees apart, pause, return slowly.'],
  ['hip-adduction', 'Hip Adduction', 'Legs', 'machine', 'adduct', 'Sit tall. Squeeze knees together, pause, return slowly.'],
  ['calf-raise', 'Standing Calf Raise', 'Legs', 'machine', 'calf', 'Full stretch at the bottom, rise onto the big toe, pause at the top.'],
  ['seated-calf-raise', 'Seated Calf Raise', 'Legs', 'machine', 'calf', 'Pad on the lower thigh. Deep stretch, slow rise, pause.'],

  // Chest
  ['chest-press', 'Chest Press', 'Chest', 'machine', 'hpush', 'Handles at mid-chest. Shoulder blades back, press without locking elbows.'],
  ['db-bench', 'Dumbbell Bench Press', 'Chest', 'dumbbell', 'hpush', 'Elbows about 45 degrees from your sides. Lower to chest level, press up and in.'],
  ['bench-press', 'Bench Press', 'Chest', 'barbell', 'hpush', 'Shoulder blades pinched, feet planted. Bar to the lower chest, press back over the shoulders.'],
  ['push-up', 'Push-Up', 'Chest', 'bodyweight', 'hpush', 'Body in one line. Chest to the floor, elbows about 45 degrees.'],
  ['dip', 'Dip', 'Chest', 'bodyweight', 'hpush', 'Lean slightly forward. Lower until upper arms are level, press up.'],
  ['incline-db-press', 'Incline Dumbbell Press', 'Chest', 'dumbbell', 'incpush', 'Bench at about 30 degrees. Lower to the upper chest, press straight up.'],
  ['incline-chest-press', 'Incline Chest Press', 'Chest', 'machine', 'incpush', 'Seat set so handles line up with the upper chest. Press up, control down.'],
  ['incline-bench', 'Incline Bench Press', 'Chest', 'barbell', 'incpush', 'Bench at about 30 degrees. Bar to the upper chest, elbows under the bar.'],
  ['pec-deck', 'Pec Deck Fly', 'Chest', 'machine', 'fly', 'Slight bend in the elbows. Bring hands together, squeeze, open slowly.'],
  ['cable-fly', 'Cable Fly', 'Chest', 'cable', 'fly', 'Step forward, slight lean. Hug a wide arc until hands meet.'],
  ['db-fly', 'Dumbbell Fly', 'Chest', 'dumbbell', 'fly', 'Soft elbows. Open wide to a stretch, bring the weights back over the chest.'],

  // Back
  ['seated-row', 'Seated Cable Row', 'Back', 'cable', 'hpull', 'Sit tall. Pull to the lower ribs, squeeze shoulder blades, reach forward under control.'],
  ['machine-row', 'Machine Row', 'Back', 'machine', 'hpull', 'Chest on the pad. Pull elbows back past your sides, pause.'],
  ['db-row', 'One-Arm Dumbbell Row', 'Back', 'dumbbell', 'hpull', 'Hand and knee on a bench, back flat. Pull the dumbbell to your hip.'],
  ['chest-supported-row', 'Chest-Supported Row', 'Back', 'dumbbell', 'hpull', 'Chest on an incline bench. Row both dumbbells, squeeze at the top.'],
  ['barbell-row', 'Barbell Row', 'Back', 'barbell', 'hpull', 'Hinge to about 45 degrees, back flat. Pull the bar to the lower ribs.'],
  ['t-bar-row', 'T-Bar Row', 'Back', 'barbell', 'hpull', 'Hinge with a flat back. Pull the handle to your chest, lower fully.'],
  ['inverted-row', 'Inverted Row', 'Back', 'bodyweight', 'hpull', 'Body straight under a bar. Pull your chest to the bar.'],
  ['lat-pulldown', 'Lat Pulldown', 'Back', 'cable', 'vpull', 'Grip just outside the shoulders. Pull to the upper chest, elbows down, no swinging.'],
  ['close-grip-pulldown', 'Close-Grip Pulldown', 'Back', 'cable', 'vpull', 'Palms facing each other. Pull to the chest, lean back only slightly.'],
  ['straight-arm-pulldown', 'Straight-Arm Pulldown', 'Back', 'cable', 'vpull', 'Arms nearly straight. Sweep the bar to your thighs, feel the lats.'],
  ['pull-up', 'Pull-Up', 'Back', 'bodyweight', 'vpull', 'Start from a full hang. Pull until your chin clears the bar, lower all the way.'],
  ['chin-up', 'Chin-Up', 'Back', 'bodyweight', 'vpull', 'Palms toward you. Chin over the bar, full hang at the bottom.'],
  ['face-pull', 'Face Pull', 'Back', 'cable', 'reardelt', 'Rope at face height. Pull toward your eyes, elbows high and wide.'],
  ['db-shrug', 'Dumbbell Shrug', 'Back', 'dumbbell', 'shrug', 'Arms straight. Lift shoulders straight up to the ears, pause, lower.'],

  // Shoulders
  ['db-shoulder-press', 'Dumbbell Shoulder Press', 'Shoulders', 'dumbbell', 'vpush', 'Start at ear height, forearms vertical. Press overhead without arching your back.'],
  ['machine-shoulder-press', 'Machine Shoulder Press', 'Shoulders', 'machine', 'vpush', 'Handles at shoulder height. Press up, stop just short of locking out.'],
  ['arnold-press', 'Arnold Press', 'Shoulders', 'dumbbell', 'vpush', 'Start palms toward you. Rotate out as you press overhead.'],
  ['overhead-press', 'Overhead Press', 'Shoulders', 'barbell', 'vpush', 'Bar from the collarbone. Squeeze glutes, press straight up, head through at the top.'],
  ['lateral-raise', 'Dumbbell Lateral Raise', 'Shoulders', 'dumbbell', 'lateral', 'Slight bend in the elbows. Raise to shoulder height, lead with the elbows.'],
  ['cable-lateral-raise', 'Cable Lateral Raise', 'Shoulders', 'cable', 'lateral', 'Cable crosses in front of you. Raise out to shoulder height, lower slowly.'],
  ['front-raise', 'Front Raise', 'Shoulders', 'dumbbell', 'lateral', 'Raise to eye level with straight arms. No swinging.'],
  ['upright-row', 'Upright Row', 'Shoulders', 'cable', 'lateral', 'Pull to the lower chest, elbows above the hands. Stop if the shoulders pinch.'],
  ['reverse-pec-deck', 'Reverse Pec Deck', 'Shoulders', 'machine', 'reardelt', 'Chest on the pad. Open arms wide and back, pause.'],
  ['db-reverse-fly', 'Dumbbell Reverse Fly', 'Shoulders', 'dumbbell', 'reardelt', 'Hinge forward, back flat. Raise arms out to the sides, thumbs forward.'],

  // Arms
  ['db-curl', 'Dumbbell Curl', 'Arms', 'dumbbell', 'curl', 'Elbows pinned at your sides. Curl up, turn the palms up, lower slowly.'],
  ['hammer-curl', 'Hammer Curl', 'Arms', 'dumbbell', 'curl', 'Palms facing each other throughout. Elbows still.'],
  ['incline-curl', 'Incline Dumbbell Curl', 'Arms', 'dumbbell', 'curl', 'Lie back on an incline, arms hanging. Curl without moving the elbows forward.'],
  ['cable-curl', 'Cable Curl', 'Arms', 'cable', 'curl', 'Elbows at your sides. Curl to the shoulders, resist on the way down.'],
  ['preacher-curl', 'Preacher Curl', 'Arms', 'machine', 'curl', 'Upper arms flat on the pad. Curl up, lower almost to straight.'],
  ['ez-curl', 'EZ-Bar Curl', 'Arms', 'barbell', 'curl', 'Grip the angled part. Curl without leaning back.'],
  ['barbell-curl', 'Barbell Curl', 'Arms', 'barbell', 'curl', 'Shoulder-width grip. Elbows still, no swing.'],
  ['triceps-pushdown', 'Triceps Pushdown', 'Arms', 'cable', 'triceps', 'Elbows locked to your sides. Push down to straight arms, return to 90 degrees.'],
  ['overhead-triceps', 'Overhead Triceps Extension', 'Arms', 'cable', 'triceps', 'Face away, rope behind the head. Extend overhead, elbows pointing forward.'],
  ['db-overhead-triceps', 'Dumbbell Overhead Triceps Extension', 'Arms', 'dumbbell', 'triceps', 'One dumbbell in both hands. Lower behind the head, extend fully.'],
  ['triceps-dip-machine', 'Triceps Dip Machine', 'Arms', 'machine', 'triceps', 'Elbows close. Press down to straight arms, rise under control.'],
  ['skullcrusher', 'Skullcrusher', 'Arms', 'barbell', 'triceps', 'Lower the bar toward the forehead, upper arms still, extend.'],
  ['close-grip-bench', 'Close-Grip Bench Press', 'Arms', 'barbell', 'triceps', 'Hands shoulder width. Elbows tucked, bar to the lower chest.'],
  ['bench-dip', 'Bench Dip', 'Arms', 'bodyweight', 'triceps', 'Hands on a bench behind you. Lower until elbows reach 90 degrees.'],
  ['wrist-curl', 'Wrist Curl', 'Arms', 'dumbbell', 'forearm', 'Forearms on your thighs. Curl the wrists up, lower fully.'],

  // Core
  ['cable-crunch', 'Cable Crunch', 'Core', 'cable', 'abs', 'Kneel, rope by your head. Curl ribs toward hips. Do not pull with the arms.'],
  ['ab-machine', 'Ab Crunch Machine', 'Core', 'machine', 'abs', 'Curl forward from the ribs, pause, return slowly.'],
  ['crunch', 'Crunch', 'Core', 'bodyweight', 'abs', 'Lower back on the floor. Lift shoulder blades, exhale at the top.'],
  ['bicycle-crunch', 'Bicycle Crunch', 'Core', 'bodyweight', 'abs', 'Elbow toward the opposite knee. Slow and controlled.'],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'Core', 'bodyweight', 'abs', 'Hang still. Bring knees to chest without swinging.'],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'Core', 'bodyweight', 'abs', 'Legs straight. Raise to hip height, lower slowly.'],
  ['lying-leg-raise', 'Lying Leg Raise', 'Core', 'bodyweight', 'abs', 'Lower back pressed down. Lower straight legs slowly, stop before the back arches.'],
  ['ab-wheel', 'Ab Wheel Rollout', 'Core', 'bodyweight', 'abs', 'From the knees. Roll out with a flat back, pull back with the abs.'],
  ['russian-twist', 'Russian Twist', 'Core', 'dumbbell', 'rotate', 'Lean back, feet down. Rotate the shoulders, not just the arms.'],
  ['cable-woodchop', 'Cable Woodchop', 'Core', 'cable', 'rotate', 'Arms straight. Rotate from the trunk, pivot the back foot.'],
  ['pallof-press', 'Pallof Press', 'Core', 'cable', 'rotate', 'Side on to the cable. Press straight out and resist the twist.'],

  // Cardio
  ['treadmill', 'Treadmill Run', 'Cardio', 'cardio', 'cardio', 'A pace where you can still speak in short sentences.'],
  ['incline-walk', 'Incline Walk', 'Cardio', 'cardio', 'cardio', 'Steep incline, brisk walk, no holding the rails.'],
  ['bike', 'Stationary Bike', 'Cardio', 'cardio', 'cardio', 'Seat at hip height. Steady effort, slight bend in the knee at the bottom.'],
  ['rower', 'Rowing Machine', 'Cardio', 'cardio', 'cardio', 'Legs, then back, then arms. Reverse on the way in.'],
  ['elliptical', 'Elliptical', 'Cardio', 'cardio', 'cardio', 'Stand tall, steady rhythm, light grip.'],
  ['stair-climber', 'Stair Climber', 'Cardio', 'cardio', 'cardio', 'Full steps, upright, hands resting lightly.'],
  ['jump-rope', 'Jump Rope', 'Cardio', 'cardio', 'cardio', 'Small jumps, turn from the wrists.'],
  ['outdoor-run', 'Outdoor Run', 'Cardio', 'cardio', 'cardio', 'Easy pace. You should be able to talk.'],
];

export const EXERCISES = ROWS.map(([id, name, muscle, equip, group, cue]) => ({ id, name, muscle, equip, group, cue }));

const item = (ex, optional) => ({ ex, sets: 3, min: 8, max: 12, ...(optional && { optional: true }) });

export const ROUTINES = [
  {
    id: 'a',
    name: 'Routine A',
    order: 0,
    items: [item('leg-press'), item('chest-press'), item('seated-row'), item('db-shoulder-press'), item('cable-crunch', true)],
  },
  {
    id: 'b',
    name: 'Routine B',
    order: 1,
    items: [item('rdl'), item('lat-pulldown'), item('incline-db-press'), item('leg-curl'), item('db-curl', true)],
  },
];

export const SETTINGS = { key: 'settings', unit: 'kg', weeklyTarget: 3 };
